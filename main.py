from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# 🔹 Database connection (Neon / PostgreSQL)
conn = psycopg2.connect(os.getenv("DATABASE_URL"))


# 🔹 Request Model
class User(BaseModel):
    name: str
    dob: str
    gender: str
    block: str
    town: str   # ✅ NEW FIELD
    phone_number: str
    will_vote: bool
    wont_accept_bribe: bool


# ✅ 1️⃣ Add / Update User (UPSERT)
@app.post("/add-user")
def add_user(user: User):
    try:
        cursor = conn.cursor()

        query = """
        INSERT INTO voters (
            name, dob, gender, block, town,
            phone_number, will_vote, wont_accept_bribe
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (phone_number)
        DO UPDATE SET
            name = EXCLUDED.name,
            dob = EXCLUDED.dob,
            gender = EXCLUDED.gender,
            block = EXCLUDED.block,
            town = EXCLUDED.town,
            will_vote = EXCLUDED.will_vote,
            wont_accept_bribe = EXCLUDED.wont_accept_bribe;
        """

        cursor.execute(query, (
            user.name,
            user.dob,
            user.gender,
            user.block,
            user.town,   # ✅ NEW
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
            id, name, dob, gender, block, town,
            phone_number, is_verified,
            will_vote, wont_accept_bribe, created_at
        FROM voters
        ORDER BY created_at DESC
        """

        cursor.execute(query)
        rows = cursor.fetchall()

        users = []
        for row in rows:
            users.append({
                "id": row[0],
                "name": row[1],
                "dob": str(row[2]),
                "gender": row[3],
                "block": row[4],
                "town": row[5],   # ✅ NEW
                "phone_number": row[6],
                "is_verified": row[7],
                "will_vote": row[8],
                "wont_accept_bribe": row[9],
                "created_at": str(row[10])
            })

        cursor.close()
        return {"success": True, "data": users}

    except Exception as e:
    print("REAL ERROR:", e)
    raise HTTPException(status_code=500, detail=str(e))
