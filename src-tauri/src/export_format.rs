//! EPUB / DOCX structured export.

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::project_meta::load_bundle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportChapter {
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub workspace_root: String,
    pub dest_path: String,
    pub format: String,
    pub chapters: Vec<ExportChapter>,
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn paragraphs_to_docx_xml(text: &str) -> String {
    let mut out = String::new();
    for line in text.lines() {
        let escaped = escape_xml(line);
        out.push_str(&format!(
            "<w:p><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
            escaped
        ));
    }
    if out.is_empty() {
        out = "<w:p><w:r><w:t></w:t></w:r></w:p>".to_string();
    }
    out
}

pub fn export_docx(req: &ExportRequest) -> Result<(), String> {
    let bundle = load_bundle(&req.workspace_root)?;
    let file = File::create(&req.dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut body = String::new();
    body.push_str(&format!(
        "<w:p><w:pPr><w:pStyle w:val=\"Title\"/></w:pPr><w:r><w:t>{}</w:t></w:r></w:p>",
        escape_xml(&bundle.project.book_name)
    ));
    for ch in &req.chapters {
        body.push_str(&format!(
            "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>{}</w:t></w:r></w:p>",
            escape_xml(&ch.title)
        ));
        body.push_str(&paragraphs_to_docx_xml(&ch.content));
    }

    let document_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>{body}</w:body>
</w:document>"#
    );

    zip.start_file("[Content_Types].xml", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.start_file("_rels/.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    zip.start_file("word/document.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(document_xml.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn export_epub(req: &ExportRequest) -> Result<(), String> {
    let bundle = load_bundle(&req.workspace_root)?;
    let file = File::create(&req.dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("mimetype", options).map_err(|e| e.to_string())?;
    zip.write_all(b"application/epub+zip").map_err(|e| e.to_string())?;

    let title = escape_xml(&bundle.project.book_name);
    let mut nav_items = String::new();
    let mut spine = String::from("<itemref idref=\"nav\"/>");
    let mut manifest = String::from(
        "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\"/>",
    );

    for (i, ch) in req.chapters.iter().enumerate() {
        let id = format!("ch{}", i + 1);
        nav_items.push_str(&format!(
            "<li><a href=\"{}.xhtml\">{}</a></li>",
            id,
            escape_xml(&ch.title)
        ));
        manifest.push_str(&format!(
            "<item id=\"{}\" href=\"{}.xhtml\" media-type=\"application/xhtml+xml\"/>",
            id, id
        ));
        spine.push_str(&format!("<itemref idref=\"{}\"/>", id));

        let html = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{}</title></head>
<body><h1>{}</h1>{}</body>
</html>"#,
            escape_xml(&ch.title),
            escape_xml(&ch.title),
            ch.content
                .lines()
                .map(|l| format!("<p>{}</p>", escape_xml(l)))
                .collect::<Vec<_>>()
                .join("")
        );
        zip.start_file(format!("{}.xhtml", id), options).map_err(|e| e.to_string())?;
        zip.write_all(html.as_bytes()).map_err(|e| e.to_string())?;
    }

    let nav = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{}</title></head>
<body><nav><ol>{}</ol></nav></body>
</html>"#,
        title, nav_items
    );
    zip.start_file("nav.xhtml", options).map_err(|e| e.to_string())?;
    zip.write_all(nav.as_bytes()).map_err(|e| e.to_string())?;

    let opf = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="uid">cinyuverse-export</dc:identifier>
  </metadata>
  <manifest>{manifest}</manifest>
  <spine>{spine}</spine>
</package>"#,
        title, manifest = manifest, spine = spine
    );
    zip.start_file("content.opf", options).map_err(|e| e.to_string())?;
    zip.write_all(opf.as_bytes()).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cv_export_book(request: ExportRequest) -> Result<String, String> {
    let dest = Path::new(&request.dest_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match request.format.as_str() {
        "epub" => export_epub(&request)?,
        "docx" => export_docx(&request)?,
        other => return Err(format!("不支持的导出格式: {}", other)),
    }
    Ok(request.dest_path)
}

fn platform_chapter(title: &str, content: &str, platform: &str) -> String {
    match platform {
        "fanqie" | "tomato" => {
            format!(
                "第{}章 {}\n\n{}\n\n",
                title.chars().take(2).collect::<String>(),
                title,
                content.trim()
            )
        }
        "qidian" => {
            format!(
                "【{}】\n\n{}\n\n━━━━━━━━━━━━━━━━\n\n",
                title,
                content.trim()
            )
        }
        "jinjiang" => {
            format!(
                "==== {} ====\n\n{}\n\n",
                title,
                content.trim()
            )
        }
        _ => format!("# {}\n\n{}\n\n", title, content),
    }
}

#[tauri::command]
pub fn cv_export_platform(
    workspace_root: String,
    platform: String,
    dest_path: String,
    chapters: Vec<ExportChapter>,
) -> Result<String, String> {
    let bundle = load_bundle(&workspace_root)?;
    let mut body = format!(
        "《{}》\n作者：{}\n平台：{}\n\n",
        bundle.project.book_name,
        bundle.project.author,
        platform
    );
    for (i, ch) in chapters.iter().enumerate() {
        let title = if ch.title.is_empty() {
            format!("第{}章", i + 1)
        } else {
            ch.title.clone()
        };
        body.push_str(&platform_chapter(&title, &ch.content, &platform));
    }
    if let Some(parent) = Path::new(&dest_path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&dest_path, body).map_err(|e| e.to_string())?;
    Ok(dest_path)
}

#[tauri::command]
pub fn cv_export_volume_bundle(
    workspace_root: String,
    volume_id: String,
    dest_zip: String,
) -> Result<String, String> {
    let bundle = load_bundle(&workspace_root)?;
    let vol = bundle
        .outline
        .volume_nodes
        .iter()
        .find(|v| v.id == volume_id)
        .ok_or_else(|| "分卷不存在".to_string())?;

    let file = File::create(&dest_zip).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    if let Some(children) = &vol.children {
        for ch in children {
            if let Some(fp) = &ch.file_path {
                let path = Path::new(fp);
                if path.exists() {
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("chapter.md");
                    zip.start_file(name, options).map_err(|e| e.to_string())?;
                    let data = fs::read(path).map_err(|e| e.to_string())?;
                    zip.write_all(&data).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest_zip)
}
