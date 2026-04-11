from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://vote-pledge.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 🔹 Database connection (Neon / PostgreSQL)
conn = psycopg2.connect(os.getenv("DATABASE_URL"))


# 🔹 Request Model
class User(BaseModel):
    name: str
    dob: str
    age: int   # ✅ NEW
    gender: str
    block: str
    town: str
    phone_number: str
    will_vote: bool
    wont_accept_bribe: bool


# ✅ 1️⃣ Add / Update User (UPSERT)
@app.post("/add-user")
def add_user(user: User):
    try:
        if user.age < 18:
            raise HTTPException(status_code=400, detail="Must be 18+")
        cursor = conn.cursor()
        query = """
                INSERT INTO voters (
                    name, dob, age, gender, block, town,
                    phone_number, will_vote, wont_accept_bribe
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (phone_number)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    dob = EXCLUDED.dob,
                    age = EXCLUDED.age,
                    gender = EXCLUDED.gender,
                    block = EXCLUDED.block,
                    town = EXCLUDED.town,
                    will_vote = EXCLUDED.will_vote,
                    wont_accept_bribe = EXCLUDED.wont_accept_bribe;
                """

        cursor.execute(query, (
                    user.name,
                    user.dob,
                    user.age,   # ✅ NEW
                    user.gender,
                    user.block,
                    user.town,
                    user.phone_number,
                    user.will_vote,
                    user.wont_accept_bribe
                ))

        conn.commit()
        cursor.close()

        return {"success": True, "message": "User saved successfully"}

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail="Database error")


# ✅ 2️⃣ Get All Users
@app.get("/get-users")
def get_users():
    try:
        cursor = conn.cursor()

        query = """
       SELECT 
        id, name, dob, age, gender, block, town,
        phone_number, is_verified,
        will_vote, wont_accept_bribe, created_at
        FROM voters
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        users = []
        for row in rows:
            users.append({
                "id": row[0],
                "name": row[1],
                "dob": str(row[2]),
                "age": row[3],   # ✅ NEW
                "gender": row[4],
                "block": row[5],
                "town": row[6],
                "phone_number": row[7],
                "is_verified": row[8],
                "will_vote": row[9],
                "wont_accept_bribe": row[10],
                "created_at": str(row[11])
            })

        cursor.close()
        return {"success": True, "data": users}
    

    except Exception as e:
        print("REAL ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))
        
@app.get("/get-user/{phone_number}")
def get_user(phone_number: str):
    try:
        cursor = conn.cursor()

        query = """
        SELECT 
            id, name, dob, age, gender, block, town,
            phone_number, is_verified,
            will_vote, wont_accept_bribe, created_at
        FROM voters
        WHERE phone_number = %s
        """

        cursor.execute(query, (phone_number,))
        row = cursor.fetchone()

        cursor.close()

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        # ✅ FIXED
        user = {
            "id": row[0],
            "name": row[1],
            "dob": str(row[2]),
            "age": row[3],
            "gender": row[4],
            "block": row[5],
            "town": row[6],
            "phone_number": row[7],
            "is_verified": row[8],
            "will_vote": row[9],
            "wont_accept_bribe": row[10],
            "created_at": str(row[11])
        }

        return {"success": True, "data": user}

    except Exception as e:
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))
