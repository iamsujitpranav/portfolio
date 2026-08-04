"""Build the downloadable recruiter résumé from content/resume.json.

Layout is deliberately ATS-friendly: a single linear column, real text in a
standard font, plain "•" bullets, and conventional section names — no tables,
text boxes, or graphics that trip résumé parsers.
"""

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
    HRFlowable,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "resume.json"
OUTPUTS = (ROOT / "output" / "pdf" / "recruiter-resume.pdf", ROOT / "public" / "resume.pdf")

ACCENT = colors.HexColor("#b32642")
INK = colors.HexColor("#17191f")
MUTED = colors.HexColor("#626978")
RULE = colors.HexColor("#d9d5cc")


def ascii_text(value: object) -> str:
    """Keep the PDF Helvetica-safe and avoid layout-breaking Unicode glyphs."""
    text = str(value)
    replacements = {
        "–": "-",
        "—": "-",
        "−": "-",
        "→": "->",
        "×": "x",
        "↓": "down",
        "★": "*",
        "·": "-",
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        " ": " ",
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


def period_text(value: str) -> str:
    return re.sub(r"\bpresent\b", "Present", esc(value))


def bare_url(value: str) -> str:
    return re.sub(r"^https?://(www\.)?", "", value).rstrip("/")


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
        canvas.drawString(doc.leftMargin, 10 * mm, "Sujit Pranav Reddy")
        canvas.drawRightString(width - doc.rightMargin, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()


def build() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    profile = data["profile"]
    experience = data["experience"]
    skills = data["skillGroups"]

    styles = getSampleStyleSheet()
    name = ParagraphStyle(
        "Name", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24,
        leading=27, textColor=INK, spaceAfter=2, alignment=TA_LEFT,
    )
    title = ParagraphStyle(
        "TitleLine", parent=styles["Normal"], fontName="Helvetica", fontSize=11,
        leading=15, textColor=ACCENT, spaceAfter=8,
    )
    contact = ParagraphStyle(
        "Contact", parent=styles["Normal"], fontName="Helvetica", fontSize=8.8,
        leading=12.5, textColor=MUTED, spaceAfter=4,
    )
    section = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10,
        leading=13, textColor=ACCENT, spaceBefore=10, spaceAfter=2,
    )
    role = ParagraphStyle(
        "Role", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=10.5,
        leading=13.5, textColor=INK, spaceBefore=6, spaceAfter=1,
    )
    meta = ParagraphStyle(
        "Meta", parent=styles["Normal"], fontName="Helvetica", fontSize=8.6,
        leading=11.5, textColor=MUTED, spaceAfter=3,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.8,
        leading=12.2, textColor=MUTED, spaceAfter=4,
    )
    bullet = ParagraphStyle(
        "Bullet", parent=body, leftIndent=10, bulletIndent=2, spaceAfter=3,
    )

    def heading(label: str) -> list[object]:
        return [
            Paragraph(label, section),
            HRFlowable(width="100%", thickness=0.6, color=RULE, spaceBefore=0, spaceAfter=4),
        ]

    links = " | ".join(
        f'<link href="{profile[key]}" color="#626978">{esc(bare_url(profile[key]))}</link>'
        for key in ("linkedin", "github")
    )
    story: list[object] = [
        Paragraph(esc(profile["name"]), name),
        Paragraph(esc(profile["title"]), title),
        Paragraph(
            f"{esc(profile['location'])} | {esc(profile['email'])} | {esc(profile['phone'])}",
            contact,
        ),
        Paragraph(f"{links} | {esc(profile['openTo'])}", contact),
        KeepTogether([*heading("PROFESSIONAL SUMMARY"), Paragraph(esc(profile["summary"]), body)]),
        *heading("PROFESSIONAL EXPERIENCE"),
    ]

    for job in experience:
        block: list[object] = [
            Paragraph(esc(job["role"]), role),
            Paragraph(esc(job["company"]) + " | " + period_text(job["period"]), meta),
            Paragraph(esc(job["summary"]), body),
        ]
        for item in job.get("projects", []):
            block.append(Paragraph(
                f"<bullet>&bull;</bullet><b>{esc(item['name'])}:</b> {esc(item['summary'])}", bullet,
            ))
        block.append(Paragraph(
            "<b>Technologies:</b> " + ", ".join(esc(item) for item in job["stack"]), meta,
        ))
        story.append(KeepTogether(block))

    groups = [
        Paragraph(
            f"<b>{esc(group['title'])}:</b> {esc(', '.join(list(group.get('star', [])) + list(group['skills'])))}",
            body,
        )
        for group in skills
    ]
    story.append(KeepTogether([*heading("TECHNICAL SKILLS"), groups[0]]))
    story.extend(groups[1:])

    story.extend([
        KeepTogether([
            *heading("LEADERSHIP FOCUS"),
            Paragraph(
                "Architecture direction, delivery planning, code review, mentoring, platform modernization, and building practical AI capabilities that can be operated in production.",
                body,
            ),
        ]),
        KeepTogether([*heading("EDUCATION"), Paragraph(esc(profile["education"]), body)]),
        KeepTogether([*heading("LANGUAGES"), Paragraph(esc(", ".join(profile["languages"])), body)]),
        KeepTogether([
            *heading("PERSONAL DETAILS"),
            Paragraph("<b>Date of Birth:</b> " + esc(profile["dateOfBirth"]), body),
            Paragraph("<b>Hobbies:</b> " + esc(", ".join(profile["hobbies"])), body),
            Paragraph("<b>Marital Status:</b> " + esc(profile["maritalStatus"]), body),
        ]),
    ])

    for output in OUTPUTS[:1]:
        output.parent.mkdir(parents=True, exist_ok=True)
        doc = ResumeDocTemplate(
            str(output), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
            topMargin=18 * mm, bottomMargin=15 * mm, title="Sujit Pranav Reddy - Resume",
            author="Sujit Pranav Reddy",
        )
        doc.build(story)
        shutil.copyfile(output, OUTPUTS[1])


if __name__ == "__main__":
    build()
