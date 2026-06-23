// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/LingByte/CinyuVerse/internal/service/workspace"
	myllm "github.com/LingByte/CinyuVerse/pkg/llm"
	"github.com/LingByte/CinyuVerse/pkg/config"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ── WebSocket Route Registration ────────────────────────────────────

func (ch *CinyuHandlers) registerWebSocketRoutes(r *gin.RouterGroup) {
	r.GET("/ws/ai/stream", func(ginCtx *gin.Context) {
		ch.AiStreamWS(ginCtx.Writer, ginCtx.Request)
	})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ── WS Message Types ───────────────────────────────────────────────

// ChatMessage 对话历史中的单条消息
type ChatMessage struct {
	Role    string `json:"role"`    // "user" | "assistant" | "system"
	Content string `json:"content"`
}

type wsRequest struct {
	Type        string        `json:"type"`        // "chat" | "create" | "new_chapter" | "stop"
	Mode        string        `json:"mode"`        // "chapter" | "select" | "rewrite" | "expand" | "condense" | "polish"
	WorkspaceID string        `json:"workspace_id"`
	VolumeID    string        `json:"volume_id"`
	ChapterID   string        `json:"chapter_id"`
	SelectText  string        `json:"select_text"`
	Instruction string        `json:"instruction"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
	Model       string        `json:"model"`
	History     []ChatMessage `json:"history"` // 对话历史（跨模式共享）
}

type wsResponse struct {
	Type     string       `json:"type"`
	Data     string       `json:"data"`
	Usage    *myllm.Usage `json:"usage,omitempty"`
	Error    string       `json:"error,omitempty"`
	ToolCall *toolCallInfo `json:"toolCall,omitempty"`
}

type toolCallInfo struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

// AiStreamWS WebSocket /api/ws/ai/stream — AI 流式对话与创作
func (ch *CinyuHandlers) AiStreamWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	var req wsRequest
	if err := conn.ReadJSON(&req); err != nil {
		sendWS(conn, wsResponse{Type: "error", Error: "invalid request: " + err.Error()})
		return
	}

	if req.Type == "stop" {
		return
	}

	wsSvc := workspace.GetService()
	_, err = wsSvc.GetWorkspace(req.WorkspaceID)
	if err != nil {
		sendWS(conn, wsResponse{Type: "error", Error: "workspace not found: " + err.Error()})
		return
	}

	switch req.Type {
	case "chat":
		ch.handleChat(conn, r, req, wsSvc)
	case "new_chapter":
		ch.handleNewChapter(conn, r, req, wsSvc)
	default:
		// "create" 或默认：创作模式（启用工具）
		ch.handleCreate(conn, r, req, wsSvc)
	}
}

// buildChatSystemPrompt 构建对话模式的系统提示词（包含作品设定摘要）
func buildChatSystemPrompt(wsSvc *workspace.FileService, wsID string) string {
	wsMeta, _ := wsSvc.GetWorkspace(wsID)

	prompt := `你是 CinyuVerse 专业小说创作助手。当前处于【对话模式】。

规则：
1. 与用户讨论剧情、人物、大纲、设定，回答创作相关问题
2. 不要调用任何文件工具，不要扫描项目文件
3. 当用户要求写正文或新建章节时，提示用户切换到【创作模式】或点击「写正文」
4. 记住用户提到的所有剧情构思、人设要求、文风偏好，后续创作会自动继承

`
	if wsMeta != nil {
		prompt += fmt.Sprintf("【当前作品设定摘要】\n书名：%s\n", wsMeta.BookName)
		if wsMeta.Type != "" {
			prompt += fmt.Sprintf("题材：%s\n", wsMeta.Type)
		}
		if wsMeta.WorldView != "" {
			wv := wsMeta.WorldView
			if len(wv) > 500 {
				wv = wv[:500] + "..."
			}
			prompt += fmt.Sprintf("世界观：%s\n", wv)
		}
		if wsMeta.Character != "" {
			ch := wsMeta.Character
			if len(ch) > 500 {
				ch = ch[:500] + "..."
			}
			prompt += fmt.Sprintf("人物：%s\n", ch)
		}
		if wsMeta.Outline != "" {
			ol := wsMeta.Outline
			if len(ol) > 500 {
				ol = ol[:500] + "..."
			}
			prompt += fmt.Sprintf("大纲：%s\n", ol)
		}
	}
	return prompt
}

// handleChat 对话模式：纯聊天，禁用工具，保留记忆
func (ch *CinyuHandlers) handleChat(conn *websocket.Conn, r *http.Request, req wsRequest, wsSvc *workspace.FileService) {
	systemPrompt := buildChatSystemPrompt(wsSvc, req.WorkspaceID)

	model := pickModel(req.Model)
	client := myllm.NewStreamClient(
		config.GlobalConfig.Services.LLM.BaseURL,
		config.GlobalConfig.Services.LLM.APIKey,
		model,
	)

	temp := req.Temperature
	if temp <= 0 {
		temp = 0.7
	}
	maxTok := req.MaxTokens
	if maxTok <= 0 {
		maxTok = 2048
	}

	// 构建消息：system + 历史 + 当前用户消息
	messages := []myllm.StreamMessage{
		{Role: "system", Content: systemPrompt},
	}
	for _, h := range req.History {
		if h.Role == "user" || h.Role == "assistant" {
			messages = append(messages, myllm.StreamMessage{Role: h.Role, Content: h.Content})
		}
	}
	messages = append(messages, myllm.StreamMessage{Role: "user", Content: req.Instruction})

	sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("对话模式（%s）", model)})

	streamCh, err := client.Stream(r.Context(), messages, temp, maxTok, nil)
	if err != nil {
		sendWS(conn, wsResponse{Type: "error", Error: "请求失败: " + err.Error()})
		return
	}

	var fullContent strings.Builder
	for chunk := range streamCh {
		if chunk.Error != "" {
			sendWS(conn, wsResponse{Type: "error", Error: chunk.Error})
			return
		}
		if chunk.Content != "" {
			if chunk.Reasoning {
				sendWS(conn, wsResponse{Type: "log", Data: "[思考] " + chunk.Content})
			} else {
				fullContent.WriteString(chunk.Content)
				sendWS(conn, wsResponse{Type: "text", Data: chunk.Content})
			}
		}
		if chunk.Done {
			sendWS(conn, wsResponse{Type: "done", Data: fullContent.String(), Usage: chunk.Usage})
			return
		}
	}
	sendWS(conn, wsResponse{Type: "done", Data: fullContent.String()})
}

// buildCreateSystemPrompt 构建创作模式的系统提示词
func buildCreateSystemPrompt(wsSvc *workspace.FileService, wsID string) string {
	wsMeta, _ := wsSvc.GetWorkspace(wsID)

	prompt := `你是 CinyuVerse 全自动小说创作 Agent。当前处于【创作模式】。

核心规则：
1. 你拥有完整文件操作权限，可以自主读取项目文件、新建卷、新建章节、写入正文
2. 接到创作指令后，全程自主完成，中途不要向用户提问、不要分段等待确认
3. 先读取必要素材（大纲、人物、前文），再一次性生成完整章节并保存
4. 切换模式不会遗忘之前对话中的剧情构思、人设要求，必须结合历史对话创作

自主判断何时新建卷/章节：
- 读完当前章节结尾，大纲有下一段剧情 → 自动新建同卷下一章
- 剧情进入新的大阶段、新时代、新主线 → 自动调用 CreateVolume 新建卷
- 文件已存在则续写/覆写，不重复创建
- 工作区没有卷时，WriteChapter 会自动创建第一卷

`
	if wsMeta != nil {
		prompt += fmt.Sprintf("【当前作品】\n书名：%s\n", wsMeta.BookName)
		if wsMeta.Type != "" {
			prompt += fmt.Sprintf("题材：%s\n", wsMeta.Type)
		}
		if wsMeta.Style != "" {
			prompt += fmt.Sprintf("文风：%s\n", wsMeta.Style)
		}
	}
	return prompt
}

// handleCreate 创作模式：启用工具，AI 自主读文件、写正文
func (ch *CinyuHandlers) handleCreate(conn *websocket.Conn, r *http.Request, req wsRequest, wsSvc *workspace.FileService) {
	basePrompt, err := wsSvc.BuildNovelPrompt(req.WorkspaceID, req.ChapterID, buildUserInstruction(req))
	if err != nil {
		sendWS(conn, wsResponse{Type: "error", Error: "构建提示词失败: " + err.Error()})
		return
	}

	toolExec := workspace.NewNovelToolExecutor(req.WorkspaceID)
	tools := toolExec.AllowedTools()
	systemPrompt := buildCreateSystemPrompt(wsSvc, req.WorkspaceID)
	systemPrompt += "\n" + toolExec.SystemPromptAddition()

	model := pickModel(req.Model)
	client := myllm.NewStreamClient(
		config.GlobalConfig.Services.LLM.BaseURL,
		config.GlobalConfig.Services.LLM.APIKey,
		model,
	)

	temp := req.Temperature
	if temp <= 0 {
		temp = 0.7
	}
	maxTok := req.MaxTokens
	if maxTok <= 0 {
		maxTok = 4096
	}

	// 构建消息：system + 对话历史 + 当前创作指令
	messages := []myllm.StreamMessage{
		{Role: "system", Content: systemPrompt},
	}
	// 加入对话历史（跨模式记忆共享）
	for _, h := range req.History {
		if h.Role == "user" || h.Role == "assistant" {
			messages = append(messages, myllm.StreamMessage{Role: h.Role, Content: h.Content})
		}
	}
	messages = append(messages, myllm.StreamMessage{Role: "user", Content: basePrompt})

	sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("创作模式（%s，工具已启用）", model)})

	runToolLoop(conn, r, req, wsSvc, client, messages, temp, maxTok, tools, toolExec)
}

// handleNewChapter 一键新建章节：自动创建空白章节 + 全自动写完
func (ch *CinyuHandlers) handleNewChapter(conn *websocket.Conn, r *http.Request, req wsRequest, wsSvc *workspace.FileService) {
	// 如果没有卷，先创建一个
	if req.VolumeID == "" {
		vol, err := wsSvc.NewVolume(req.WorkspaceID, "第一卷")
		if err != nil {
			sendWS(conn, wsResponse{Type: "error", Error: "创建卷失败: " + err.Error()})
			return
		}
		req.VolumeID = vol.ID
		sendWS(conn, wsResponse{Type: "log", Data: "已创建新卷：第一卷"})
	}

	// 创建空白章节
	title := req.Instruction
	if title == "" {
		title = "新章节"
	}
	chap, err := wsSvc.NewChapter(req.WorkspaceID, req.VolumeID, title)
	if err != nil {
		sendWS(conn, wsResponse{Type: "error", Error: "创建章节失败: " + err.Error()})
		return
	}
	req.ChapterID = chap.ID
	sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("已创建空白章节：%s（ID: %s）", title, chap.ID)})

	// 然后走创作流程
	ch.handleCreate(conn, r, req, wsSvc)
}

// runToolLoop 多轮工具调用循环
func runToolLoop(conn *websocket.Conn, r *http.Request, req wsRequest, wsSvc *workspace.FileService,
	client *myllm.StreamClient, messages []myllm.StreamMessage, temp float64, maxTok int,
	tools []myllm.ToolDefinition, toolExec *workspace.NovelToolExecutor) {

	maxToolRounds := 10
	var fullContent strings.Builder
	startTime := time.Now()

	for round := 0; round < maxToolRounds; round++ {
		streamCh, err := client.Stream(r.Context(), messages, temp, maxTok, tools)
		if err != nil {
			sendWS(conn, wsResponse{Type: "error", Error: "请求失败: " + err.Error()})
			return
		}

		var contentBuilder strings.Builder
		var toolCalls []myllm.ToolCall
		var usage *myllm.Usage

		for chunk := range streamCh {
			if chunk.Error != "" {
				sendWS(conn, wsResponse{Type: "error", Error: chunk.Error})
				return
			}
			if chunk.Content != "" {
				if chunk.Reasoning {
					sendWS(conn, wsResponse{Type: "log", Data: "[思考] " + chunk.Content})
				} else {
					contentBuilder.WriteString(chunk.Content)
					sendWS(conn, wsResponse{Type: "text", Data: chunk.Content})
				}
			}
			if len(chunk.ToolCalls) > 0 {
				toolCalls = chunk.ToolCalls
			}
			if chunk.Done {
				if chunk.Usage != nil {
					usage = chunk.Usage
				}
				if chunk.FinishReason == "tool_calls" && len(toolCalls) > 0 {
					assistantMsg := myllm.StreamMessage{Role: "assistant"}
					if contentBuilder.Len() > 0 {
						assistantMsg.Content = contentBuilder.String()
					}
					messages = append(messages, assistantMsg)

					for _, tc := range toolCalls {
						sendWS(conn, wsResponse{
							Type: "tool", ToolCall: &toolCallInfo{Name: tc.Function.Name, Status: "start"},
						})
						sendWS(conn, wsResponse{
							Type: "log",
							Data: fmt.Sprintf("调用工具: %s(%s)", tc.Function.Name, truncateStr(tc.Function.Arguments, 80)),
						})

						args, parseErr := myllm.ParseToolArgs(tc.Function.Arguments)
						if parseErr != nil {
							sendWS(conn, wsResponse{Type: "tool", ToolCall: &toolCallInfo{Name: tc.Function.Name, Status: "error"}})
							sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("参数解析失败: %v", parseErr)})
							messages = append(messages, myllm.StreamMessage{
								Role: "tool", ToolCallID: tc.ID, Content: fmt.Sprintf("参数错误: %v", parseErr),
							})
							continue
						}

						result, execErr := toolExec.Execute(tc.Function.Name, args)
						if execErr != nil {
							sendWS(conn, wsResponse{Type: "tool", ToolCall: &toolCallInfo{Name: tc.Function.Name, Status: "error"}})
							sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("工具失败: %v", execErr)})
							messages = append(messages, myllm.StreamMessage{
								Role: "tool", ToolCallID: tc.ID, Content: fmt.Sprintf("失败: %v", execErr),
							})
							continue
						}

						truncated := result
						if len(truncated) > 8000 {
							truncated = truncated[:8000] + "\n...(已截断)"
						}
						messages = append(messages, myllm.StreamMessage{
							Role: "tool", ToolCallID: tc.ID, Content: truncated,
						})

						sendWS(conn, wsResponse{Type: "tool", ToolCall: &toolCallInfo{Name: tc.Function.Name, Status: "done"}})
						sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("%s 完成 (%d 字符)", tc.Function.Name, len(result))})
					}

					sendWS(conn, wsResponse{Type: "log", Data: "继续创作..."})
					continue
				}

				// 正常完成
				fullContent.WriteString(contentBuilder.String())
				elapsed := time.Since(startTime).Round(time.Millisecond)
				sendWS(conn, wsResponse{Type: "done", Data: fullContent.String(), Usage: usage})
				sendWS(conn, wsResponse{Type: "log", Data: fmt.Sprintf("完成 | 耗时 %v | %d 字 | %d 轮工具",
					elapsed, len([]rune(fullContent.String())), round)})

				// 自动保存到章节
				if req.ChapterID != "" && req.VolumeID != "" {
					if err := wsSvc.SaveChapterContent(req.WorkspaceID, req.VolumeID, req.ChapterID, fullContent.String()); err != nil {
						sendWS(conn, wsResponse{Type: "log", Data: "保存失败: " + err.Error()})
					} else {
						sendWS(conn, wsResponse{Type: "log", Data: "已保存到章节"})
					}
				}
				return
			}
		}
	}

	sendWS(conn, wsResponse{Type: "error", Error: "工具调用轮数超限"})
}

func sendWS(conn *websocket.Conn, resp wsResponse) {
	if err := conn.WriteJSON(resp); err != nil {
		log.Printf("ws write: %v", err)
	}
}

func buildUserInstruction(req wsRequest) string {
	var b strings.Builder

	switch req.Mode {
	case "chapter":
		b.WriteString("请续写本章小说正文。")
	case "select":
		b.WriteString("请对以下选中文本进行改写：\n\n")
		b.WriteString(req.SelectText)
	case "rewrite":
		b.WriteString("请重写以下文本：\n\n")
		b.WriteString(req.SelectText)
	case "expand":
		b.WriteString("请扩写以下文本：\n\n")
		b.WriteString(req.SelectText)
	case "condense":
		b.WriteString("请精简以下文本：\n\n")
		b.WriteString(req.SelectText)
	case "polish":
		b.WriteString("请润色以下文本：\n\n")
		b.WriteString(req.SelectText)
	default:
		b.WriteString("请根据用户指令创作。")
	}

	if req.Instruction != "" {
		b.WriteString("\n\n用户指令：")
		b.WriteString(req.Instruction)
	}

	b.WriteString("\n\n字数要求：")
	if req.MaxTokens > 0 {
		b.WriteString(fmt.Sprintf("%d字左右。", req.MaxTokens/2))
	} else {
		b.WriteString("3000字左右。")
	}

	return b.String()
}

func pickModel(m string) string {
	m = strings.TrimSpace(m)
	if m != "" {
		return m
	}
	return config.GlobalConfig.Services.LLM.Model
}

func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
