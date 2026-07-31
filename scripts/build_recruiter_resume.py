"""Build the downloadable recruiter résumé from content/resume.json."""

from __future__ import annotations

import json
import re
from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "resume.json"
OUTPUTS = (ROOT / "output" / "pdf" / "recruiter-resume.pdf", ROOT / "public" / "resume.pdf")

ACCENT = colors.HexColor("#b32642")
INK = colors.HexColor("#17191f")
MUTED = colors.HexColor("#626978")
RULE = colors.HexColor("#d9d5cc")
PALE = colors.HexColor("#f6f4ef")


def ascii_text(value: object) -> str:
    """Keep the PDF Helvetica-safe and avoid layout-breaking Unicode glyphs."""
    text = str(value)
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2192": "->",
        "\u00d7": "x",
        "\u2193": "down",
        "\u2605": "*",
        "\u00b7": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    }
    for source, replacement in replacements.items():
        text = text.replace(source, replacement)
    return re.sub(r"\s+", " ", text).strip()


def esc(value: object) -> str:
    return (
        ascii_text(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


class ResumeDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs: object) -> None:
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates([PageTemplate(id="resume", frames=frame, onPage=self.draw_page)])

    def draw_page(self, canvas, doc) -> None:  # type: ignore[no-untyped-def]
        canvas.saveState()
        width, height = A4
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, height - 15 * mm, width - doc.rightMargin, height - 15 * mm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 10 * mm, "Sujit Pranav Reddy - Recruiter brief")
        canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"{doc.page}")
        canvas.restoreState()


def build() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    profile = data["profile"]
    experience = data["experience"]
    skills = data["skillGroups"]
    metrics = data["metrics"]

    styles = getSampleStyleSheet()
    name = ParagraphStyle(
        "Name", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=26,
        leading=29, textColor=INK, spaceAfter=3, alignment=TA_LEFT,
    )
    title = ParagraphStyle(
        "TitleLine", parent=styles["Normal"], fontName="Helvetica", fontSize=11,
        leading=15, textColor=ACCENT, spaceAfter=11,
    )
    contact = ParagraphStyle(
        "Contact", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
        leading=12, textColor=MUTED, spaceAfter=13,
    )
    section = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10,
        leading=13, textColor=ACCENT, spaceBefore=12, spaceAfter=6,
    )
    role = ParagraphStyle(
        "Role", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11,
        leading=14, textColor=INK, spaceAfter=1,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.8,
        leading=12.2, textColor=MUTED, spaceAfter=5,
    )
    project = ParagraphStyle(
        "Project", parent=body, leftIndent=9, borderPadding=(0, 0, 0, 6),
        borderColor=ACCENT, borderWidth=1, borderLeft=True, spaceAfter=5,
    )
    chip = ParagraphStyle(
        "Chip", parent=body, fontSize=8, leading=10, textColor=INK, alignment=TA_LEFT,
    )
    small = ParagraphStyle(
        "Small", parent=body, fontSize=8, leading=10.5, spaceAfter=2,
    )

    story: list[object] = [
        Paragraph(esc(profile["name"]), name),
        Paragraph(esc(profile["title"]) + " | Engineering leadership and AI platforms", title),
        Paragraph(
            f"{esc(profile['location'])} | {esc(profile['email'])} | {esc(profile['phone'])} | {esc(profile['openTo'])}",
            contact,
        ),
        Paragraph("PROFESSIONAL SUMMARY", section),
        Paragraph(esc(profile["summary"]), body),
    ]

    story.extend([Spacer(1, 2 * mm), Paragraph("PROFESSIONAL EXPERIENCE", section)])

    for job in experience:
        block: list[object] = [
            Paragraph(esc(job["role"]) + " - " + esc(job["company"]), role),
            Paragraph(esc(job["period"]), small),
            Paragraph(esc(job["summary"]), body),
        ]
        for item in job.get("projects", []):
            block.append(Paragraph(f"<b>{esc(item['name'])}</b> - {esc(item['summary'])}", project))
        block.append(Paragraph("<b>Stack:</b> " + ", ".join(esc(item) for item in job["stack"]), small))
        story.append(KeepTogether(block))

    story.extend([PageBreak(), Paragraph("TECHNICAL SKILLS", section)])
    for group in skills:
        labels = [f"* {item}" for item in group.get("star", [])] + group["skills"]
        story.append(Paragraph(f"<b>{esc(group['title'])}</b> - {esc(', '.join(labels))}", body))

    story.extend([
        Paragraph("LEADERSHIP FOCUS", section),
        Paragraph(
            "Architecture direction, delivery planning, code review, mentoring, platform modernization, and building practical AI capabilities that can be operated in production.",
            body,
        ),
        Paragraph("EDUCATION", section),
        Paragraph(esc(profile["education"]), body),
        Paragraph("LANGUAGES", section),
        Paragraph(esc(", ".join(profile["languages"])), body),
        Paragraph("PERSONAL DETAILS", section),
        Paragraph("<b>Date of Birth:</b> " + esc(profile["dateOfBirth"]), body),
        Paragraph("<b>Hobbies:</b> " + esc(", ".join(profile["hobbies"])), body),
        Paragraph("<b>Marital Status:</b> " + esc(profile["maritalStatus"]), body),
    ])

    for output in OUTPUTS[:1]:
        output.parent.mkdir(parents=True, exist_ok=True)
        doc = ResumeDocTemplate(
            str(output), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
            topMargin=22 * mm, bottomMargin=17 * mm, title="Sujit Pranav Reddy - Recruiter Resume",
            author="Sujit Pranav Reddy",
        )
        doc.build(story)
        shutil.copyfile(output, OUTPUTS[1])


if __name__ == "__main__":
    build()
