import os
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from requests.auth import HTTPBasicAuth

# Load env
load_dotenv()

app = FastAPI()

# CORS (allow your React app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Twilio credentials
ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
SERVICE_SID = os.getenv("TWILIO_SERVICE_SID")

# Request models
class PhoneRequest(BaseModel):
    phone: str

class VerifyRequest(BaseModel):
    phone: str
    code: str

# 🔹 Send OTP
@app.post("/send-otp")
def send_otp(data: PhoneRequest):
    try:
        url = f"https://verify.twilio.com/v2/Services/{SERVICE_SID}/Verifications"

        payload = {
            "To": data.phone,
            "Channel": "sms"
        }

        response = requests.post(
            url,
            data=payload,
            auth=HTTPBasicAuth(ACCOUNT_SID, AUTH_TOKEN)
        )

        return {
            "success": True,
            "message": "OTP sent",
            "twilio_response": response.json()
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# 🔹 Verify OTP
@app.post("/verify-otp")
def verify_otp(data: VerifyRequest):
    try:
        url = f"https://verify.twilio.com/v2/Services/{SERVICE_SID}/VerificationCheck"

        payload = {
            "To": data.phone,
            "Code": data.code
        }

        response = requests.post(
            url,
            data=payload,
            auth=HTTPBasicAuth(ACCOUNT_SID, AUTH_TOKEN)
        )

        result = response.json()

        if result.get("status") == "approved":
            return {
                "success": True,
                "message": "OTP verified"
            }
        else:
            return {
                "success": False,
                "message": "Invalid OTP"
            }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# 🔹 Run server (for local)
# command: uvicorn main:app --reload