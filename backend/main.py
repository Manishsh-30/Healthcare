from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DateTime
)
from sqlalchemy.orm import declarative_base, sessionmaker

from datetime import datetime
from PIL import Image

import pytesseract
import re
import io
import json


# ============================================================
# DATABASE
# ============================================================

DATABASE_URL = "sqlite:///./healthcare.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


class Prescription(Base):
    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)

    patient_name = Column(
        String,
        nullable=True
    )

    patient_age = Column(
        Integer,
        nullable=True
    )

    patient_gender = Column(
        String,
        nullable=True
    )

    medicines = Column(
        Text,
        nullable=True
    )

    raw_ocr_text = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )


Base.metadata.create_all(bind=engine)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Healthcare Prescription Analyzer",
    description="OCR based prescription analysis with SQLite database",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",

    # Deployed frontend
    "https://healthcare-frontend-b1sg.onrender.com",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# MEDICINE DATABASE
# ============================================================

MEDICINES = {

    "paracetamol": [
        "paracetamol",
        "paraceta",
        "paracet",
        "acetaminophen"
    ],

    "cetirizine": [
        "cetirizine",
        "cetirizing",
        "cetirizin"
    ],

    "azithromycin": [
        "azithromycin",
        "azithro",
        "azithrocin"
    ],

    "amoxicillin": [
        "amoxicillin",
        "amoxycillin",
        "amoxic"
    ],

    "ibuprofen": [
        "ibuprofen",
        "ibupro"
    ],

    "omeprazole": [
        "omeprazole",
        "omeprazol"
    ],

    "pantoprazole": [
        "pantoprazole",
        "pantoprazol"
    ],

    "metformin": [
        "metformin",
        "metform"
    ],

    "diclofenac": [
        "diclofenac",
        "diclofen"
    ],

    "doxycycline": [
        "doxycycline",
        "doxycycl"
    ]
}


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message": "Healthcare Prescription Analyzer API is running",
        "database": "SQLite",
        "status": "success"
    }


# ============================================================
# OCR FUNCTION
# ============================================================

def perform_ocr(image_bytes: bytes) -> str:

    try:

        image = Image.open(
            io.BytesIO(image_bytes)
        )

        image = image.convert("RGB")

        text = pytesseract.image_to_string(
            image
        )

        return text

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"OCR failed: {str(e)}"
        )


# ============================================================
# PATIENT INFORMATION EXTRACTION
# ============================================================

def extract_patient_info(text: str):

    patient_name = None
    patient_age = None
    patient_gender = None

    # --------------------------------------------------------
    # NAME
    # --------------------------------------------------------

    name_patterns = [

        r"(?:patient\s*name|patient|name)\s*[:\-]?\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)",

        r"(?:patient\s*name)\s*[:\-]?\s*([A-Za-z]+(?:\s+[A-Za-z]+)*)"
    ]

    for pattern in name_patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            name = match.group(1).strip()

            name = re.sub(
                r"\b(date|age|gender|male|female|prescription|pate)\b.*",
                "",
                name,
                flags=re.IGNORECASE
            )

            name = name.strip()

            if len(name) >= 3:

                patient_name = name

                break

    # --------------------------------------------------------
    # AGE
    # --------------------------------------------------------

    age_patterns = [

        r"\bage\s*[:\-]?\s*(\d{1,3})",

        r"\b(\d{1,3})\s*(?:years?|yrs?)\b"
    ]

    for pattern in age_patterns:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            try:

                age = int(
                    match.group(1)
                )

                if 0 <= age <= 120:

                    patient_age = age

                    break

            except ValueError:

                pass

    # --------------------------------------------------------
    # GENDER
    # --------------------------------------------------------

    if re.search(
        r"\bmale\b",
        text,
        re.IGNORECASE
    ):

        patient_gender = "Male"

    elif re.search(
        r"\bfemale\b",
        text,
        re.IGNORECASE
    ):

        patient_gender = "Female"

    return {

        "name": patient_name,

        "age": patient_age,

        "gender": patient_gender
    }


# ============================================================
# MEDICINE DETECTION
# ============================================================

def detect_medicines(text: str):

    text_lower = text.lower()

    candidates = []

    for medicine, variations in MEDICINES.items():

        best_match = None

        for variation in variations:

            if variation.lower() in text_lower:

                best_match = variation

                break

        if best_match:

            if best_match == medicine:

                confidence = 0.95

            else:

                confidence = 0.84

            candidates.append({

                "name": medicine.capitalize(),

                "confidence": confidence,

                "ocr_match": best_match,

                "dosage": None,

                "frequency": None,

                "duration": None,

                "instructions": None,

                "verified": False
            })

    return candidates


# ============================================================
# ANALYZE PRESCRIPTION
# ============================================================

@app.post("/analyze-prescription")
async def analyze_prescription(
    file: UploadFile = File(...)
):

    # --------------------------------------------------------
    # CHECK FILE
    # --------------------------------------------------------

    if not file.content_type:

        raise HTTPException(
            status_code=400,
            detail="Invalid file"
        )

    allowed_types = [

        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp"
    ]

    if file.content_type not in allowed_types:

        raise HTTPException(
            status_code=400,
            detail="Please upload a JPG, PNG or WEBP image."
        )

    # --------------------------------------------------------
    # READ IMAGE
    # --------------------------------------------------------

    image_bytes = await file.read()

    # --------------------------------------------------------
    # OCR
    # --------------------------------------------------------

    ocr_text = perform_ocr(
        image_bytes
    )

    if not ocr_text.strip():

        raise HTTPException(
            status_code=400,
            detail="Could not read text from the prescription."
        )

    # --------------------------------------------------------
    # PATIENT
    # --------------------------------------------------------

    patient = extract_patient_info(
        ocr_text
    )

    # --------------------------------------------------------
    # MEDICINES
    # --------------------------------------------------------

    medicine_candidates = detect_medicines(
        ocr_text
    )

    # --------------------------------------------------------
    # SAVE DATABASE
    # --------------------------------------------------------

    db = SessionLocal()

    try:

        prescription = Prescription(

            patient_name=patient["name"],

            patient_age=patient["age"],

            patient_gender=patient["gender"],

            medicines=json.dumps(
                medicine_candidates
            ),

            raw_ocr_text=ocr_text
        )

        db.add(prescription)

        db.commit()

        db.refresh(
            prescription
        )

        record_id = prescription.id

    finally:

        db.close()

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {

        "success": True,

        "message": "Prescription analyzed and saved successfully",

        "record_id": record_id,

        "filename": file.filename,

        "patient": patient,

        "medicine_candidates": medicine_candidates,

        "extracted_text": ocr_text,

        "ocr_text": ocr_text
    }


# ============================================================
# GET ALL PRESCRIPTIONS
# ============================================================

@app.get("/prescriptions")
def get_prescriptions():

    db = SessionLocal()

    try:

        records = (
            db.query(Prescription)
            .order_by(
                Prescription.id.desc()
            )
            .all()
        )

        result = []

        for record in records:

            medicines = []

            if record.medicines:

                try:

                    medicines = json.loads(
                        record.medicines
                    )

                except Exception:

                    medicines = []

            result.append({

                "id": record.id,

                "patient": {

                    "name": record.patient_name,

                    "age": record.patient_age,

                    "gender": record.patient_gender
                },

                "medicines": medicines,

                "ocr_text": record.raw_ocr_text,

                "created_at":
                    record.created_at.isoformat()
                    if record.created_at
                    else None
            })

        return {

            "success": True,

            "count": len(result),

            "prescriptions": result
        }

    finally:

        db.close()


# ============================================================
# GET ONE PRESCRIPTION
# ============================================================

@app.get("/prescriptions/{prescription_id}")
def get_prescription(
    prescription_id: int
):

    db = SessionLocal()

    try:

        record = (
            db.query(Prescription)
            .filter(
                Prescription.id ==
                prescription_id
            )
            .first()
        )

        if not record:

            raise HTTPException(
                status_code=404,
                detail="Prescription not found"
            )

        medicines = []

        if record.medicines:

            try:

                medicines = json.loads(
                    record.medicines
                )

            except Exception:

                medicines = []

        return {

            "success": True,

            "id": record.id,

            "patient": {

                "name": record.patient_name,

                "age": record.patient_age,

                "gender": record.patient_gender
            },

            "medicine_candidates": medicines,

            "ocr_text": record.raw_ocr_text,

            "extracted_text": record.raw_ocr_text,

            "created_at":
                record.created_at.isoformat()
                if record.created_at
                else None
        }

    finally:

        db.close()


# ============================================================
# DELETE PRESCRIPTION
# ============================================================

@app.delete("/prescriptions/{prescription_id}")
def delete_prescription(
    prescription_id: int
):

    db = SessionLocal()

    try:

        record = (
            db.query(Prescription)
            .filter(
                Prescription.id ==
                prescription_id
            )
            .first()
        )

        if not record:

            raise HTTPException(
                status_code=404,
                detail="Prescription not found"
            )

        db.delete(record)

        db.commit()

        return {

            "success": True,

            "message":
                "Prescription deleted successfully"
        }

    finally:

        db.close()


# ============================================================
# PDF REPORT
# ============================================================

@app.post("/api/prescription/report")
async def generate_prescription_report(
    data: dict
):

    try:

        from reportlab.lib.pagesizes import A4

        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle
        )

        from reportlab.lib import colors

        from reportlab.lib.styles import (
            getSampleStyleSheet
        )

        from reportlab.lib.enums import (
            TA_CENTER
        )

        # ----------------------------------------------------
        # CREATE PDF IN MEMORY
        # ----------------------------------------------------

        pdf_buffer = io.BytesIO()

        document = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )

        styles = getSampleStyleSheet()

        title_style = styles["Title"]

        title_style.alignment = TA_CENTER

        heading_style = styles["Heading2"]

        normal_style = styles["BodyText"]

        story = []

        # ----------------------------------------------------
        # TITLE
        # ----------------------------------------------------

        story.append(
            Paragraph(
                "Healthcare AI",
                title_style
            )
        )

        story.append(
            Paragraph(
                "Prescription Analysis Report",
                heading_style
            )
        )

        story.append(
            Spacer(1, 15)
        )

        # ----------------------------------------------------
        # PATIENT INFORMATION
        # ----------------------------------------------------

        story.append(
            Paragraph(
                "Patient Information",
                heading_style
            )
        )

        patient = data.get(
            "patient",
            {}
        )

        patient_name = (
            patient.get("name")
            or "Not detected"
        )

        patient_age = (
            patient.get("age")
            if patient.get("age") is not None
            else "Not detected"
        )

        patient_gender = (
            patient.get("gender")
            or "Not detected"
        )

        patient_table = Table([

            ["Name", str(patient_name)],

            ["Age", str(patient_age)],

            ["Gender", str(patient_gender)]

        ], colWidths=[120, 350])

        patient_table.setStyle(
            TableStyle([

                (
                    "GRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    colors.grey
                ),

                (
                    "BACKGROUND",
                    (0, 0),
                    (0, -1),
                    colors.lightgrey
                ),

                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP"
                ),

                (
                    "PADDING",
                    (0, 0),
                    (-1, -1),
                    7
                )
            ])
        )

        story.append(
            patient_table
        )

        story.append(
            Spacer(1, 20)
        )

        # ----------------------------------------------------
        # MEDICINES
        # ----------------------------------------------------

        story.append(
            Paragraph(
                "Detected Medicines",
                heading_style
            )
        )

        medicines = data.get(
            "medicine_candidates",
            []
        )

        if medicines:

            medicine_rows = [[
                "Medicine",
                "Confidence",
                "Dosage",
                "Frequency",
                "Duration"
            ]]

            for medicine in medicines:

                confidence = medicine.get(
                    "confidence",
                    0
                )

                confidence_text = (
                    f"{round(confidence * 100)}%"
                )

                medicine_rows.append([

                    str(
                        medicine.get(
                            "name",
                            "Unknown"
                        )
                    ),

                    confidence_text,

                    str(
                        medicine.get(
                            "dosage"
                        )
                        or "Not detected"
                    ),

                    str(
                        medicine.get(
                            "frequency"
                        )
                        or "Not detected"
                    ),

                    str(
                        medicine.get(
                            "duration"
                        )
                        or "Not detected"
                    )
                ])

            medicine_table = Table(
                medicine_rows,
                repeatRows=1
            )

            medicine_table.setStyle(
                TableStyle([

                    (
                        "GRID",
                        (0, 0),
                        (-1, -1),
                        0.5,
                        colors.grey
                    ),

                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, 0),
                        colors.lightgrey
                    ),

                    (
                        "PADDING",
                        (0, 0),
                        (-1, -1),
                        6
                    ),

                    (
                        "VALIGN",
                        (0, 0),
                        (-1, -1),
                        "TOP"
                    )
                ])
            )

            story.append(
                medicine_table
            )

        else:

            story.append(
                Paragraph(
                    "No medicines detected.",
                    normal_style
                )
            )

        story.append(
            Spacer(1, 20)
        )

        # ----------------------------------------------------
        # OCR TEXT
        # ----------------------------------------------------

        story.append(
            Paragraph(
                "Extracted Prescription Text",
                heading_style
            )
        )

        extracted_text = data.get(
            "extracted_text"
        )

        if not extracted_text:

            extracted_text = data.get(
                "ocr_text",
                ""
            )

        if not extracted_text:

            extracted_text = (
                "No OCR text available."
            )

        # Escape HTML-sensitive characters
        extracted_text = (
            str(extracted_text)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )

        story.append(
            Paragraph(
                extracted_text,
                normal_style
            )
        )

        story.append(
            Spacer(1, 25)
        )

        # ----------------------------------------------------
        # DISCLAIMER
        # ----------------------------------------------------

        story.append(
            Paragraph(
                "<b>Important:</b> This report is generated "
                "from prescription image OCR and automated "
                "processing. It may contain errors. "
                "Always compare the extracted information "
                "with the original prescription and verify "
                "it with a qualified healthcare professional.",
                normal_style
            )
        )

        story.append(
            Spacer(1, 10)
        )

        story.append(
            Paragraph(
                "This application does not provide medical "
                "diagnosis or treatment recommendations.",
                normal_style
            )
        )

        # ----------------------------------------------------
        # BUILD PDF
        # ----------------------------------------------------

        document.build(
            story
        )

        pdf_buffer.seek(0)

        from fastapi.responses import StreamingResponse

        return StreamingResponse(

            pdf_buffer,

            media_type="application/pdf",

            headers={
                "Content-Disposition":
                    "attachment; filename=prescription_report.pdf"
            }
        )

    except Exception as e:

        print(
            "PDF generation error:",
            str(e)
        )

        raise HTTPException(

            status_code=500,

            detail=f"PDF generation failed: {str(e)}"
        )