---
name: LibreOffice HTML to Word conversion
description: A conversion quirk when producing editable review documents from styled HTML in this workspace
---

When converting HTML to DOCX with the available LibreOffice binary, force the Writer import filter (`--infilter='HTML (StarWriter)'`). Without it, HTML can open as Writer/Web and DOCX export reports no compatible filter.

**Why:** The default conversion failed even though LibreOffice could open the HTML; after forcing Writer import, a border on a container became a separate bordered block around every child paragraph and inflated the pagination.

**How to apply:** For future editable review documents, use the Writer HTML import filter and keep decorative borders off wrapper `div` elements; render the resulting DOCX to PDF and inspect at least the cover and a dense page before delivery.