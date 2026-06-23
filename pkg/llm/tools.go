// Copyright (c) 2026 LingByte. All rights reserved.
// SPDX-License-Identifier: AGPL-3.0

package llm

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ── Tool Calling Types (OpenAI‑compatible) ─────────────────────────

// ToolDefinition describes a tool the model can call.
type ToolDefinition struct {
	Type     string             `json:"type"` // "function"
	Function FunctionDefinition `json:"function"`
}

// FunctionDefinition defines a callable function tool.
type FunctionDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  ToolParameters `json:"parameters"`
}

// ToolParameters is the JSON Schema for a function's parameters.
type ToolParameters struct {
	Type       string                  `json:"type"`
	Properties map[string]ParamProperty `json:"properties"`
	Required   []string                `json:"required,omitempty"`
}

// ParamProperty describes a single parameter.
type ParamProperty struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
}

// ToolCall represents a single tool call from the model (response side).
type ToolCall struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Function ToolCallFunc   `json:"function"`
}

// ToolCallFunc holds the function name and JSON‑encoded arguments.
type ToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

// ToolResult is the result of executing a tool, to be sent back.
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Content    string `json:"content"`
}

// ── Tool Executor Interface ────────────────────────────────────────

// ToolExecutor executes tool calls in the workspace context.
type ToolExecutor interface {
	// Execute runs a tool call and returns the result string.
	Execute(name string, args map[string]string) (string, error)
	// AllowedTools returns the list of tool definitions for this executor.
	AllowedTools() []ToolDefinition
	// SystemPromptAddition returns extra text to append to the system prompt.
	SystemPromptAddition() string
}

// ── Helper: Parse JSON arguments ────────────────────────────────────

// ParseToolArgs parses the JSON‑encoded arguments string into a map.
func ParseToolArgs(raw string) (map[string]string, error) {
	m := map[string]string{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		// Fallback: try any‑typed map then convert
		any := map[string]any{}
		if err2 := json.Unmarshal([]byte(raw), &any); err2 != nil {
			return nil, fmt.Errorf("parse tool args: %w", err)
		}
		for k, v := range any {
			m[k] = fmt.Sprint(v)
		}
		return m, nil
	}
	return m, nil
}

// ── Helper: Build tool‑enhanced system prompt ──────────────────────

// BuildToolAwareSystemPrompt appends tool‑usage instructions to a base prompt.
func BuildToolAwareSystemPrompt(base string, executor ToolExecutor) string {
	var b strings.Builder
	b.WriteString(base)
	b.WriteString("\n\n")
	b.WriteString(executor.SystemPromptAddition())
	return b.String()
}
