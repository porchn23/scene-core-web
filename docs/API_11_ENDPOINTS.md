# 📔 AI Video Studio - API DOCUMENTATION (CORE 11 MODULES)

เอกสารนี้รวบรวมรายละเอียดของ **11 Core Endpoints** ตามโครงสร้างระบบปัจจุบัน

---

## 1. 📂 `Projects` (`/api/v1/projects`)
จัดการโปรเจกต์ภาพยนตร์
- **POST `/`**: สร้างโปรเจกต์ใหม่ (รับ `name`, `aspect_ratio`, `tenant_id`)
- **GET `/{id}`**: ดูข้อมูลโปรเจกต์
- **GET `/{id}/script`**: 🚀 **Key Component** ดึงข้อมูลบททั้งโครงการ (Scenes > Shots > Dialogues)
- **PATCH `/{id}`**: อัปเดตข้อมูลหรือสถานะโปรเจกต์
- **DELETE `/{id}`**: ลบโปรเจกต์

## 2. 🎬 `Scenes` (`/api/v1/scenes`)
การจัดการฉากภายในโปรเจกต์
- **POST `/`**: เพิ่มฉากใหม่
- **GET `/{id}`**: ข้อมูลฉากราย ID
- **GET `/project/{project_id}`**: รายชื่อฉากทั้งหมดในโปรเจกต์
- **PATCH `/{id}`**: แก้ไขรายละเอียดฉาก (เช่น `mood`, `setting`)
- **DELETE `/{id}`**: ลบฉาก

## 3. 📸 `Shots` (`/api/v1/shots`)
รายละเอียดมุมกล้องและการเจนวิดีโอ
- **POST `/`**: สร้าง Shot ใหม่
- **GET `/scene/{scene_id}`**: รายชื่อ Shot ทั้งหมดในฉากนั้น
- **PATCH `/{id}`**: แก้ไขเทคนิค (เช่น `camera_angle`, `motion_type`)
- **POST `/{id}/generate`**: 🎬 **Action!** ส่งคำสั่งให้ AI เจนวิดีโอ (สร้าง Render Job)
- **GET `/{id}/generations`**: ดูประวัติไฟล์วิดีโอที่เจนออกมา

## 4. 🎭 `Actors` (`/api/v1/actors`)
จัดการฐานข้อมูลดาราและโมเดล AI
- **POST `/`**: ลงทะเบียนดาราใหม่
- **GET `/marketplace`**: ค้นหาดาราสาธารณะสำหรับใช้งาน
- **GET `/{actor_id}/models`**: ดูไฟล์โมเดล AI (LoRA) ของดาราคนนั้น
- **POST `/models`**: เพิ่มไฟล์โมเดลที่เทรนเสร็จแล้ว
- **PATCH `/models/{id}`**: ตั้งค่าโมเดลให้ Active

## 5. ✍️ `Scripting` (`/api/v1/scripting`)
จัดการบทพูด (Dialogues)
- **POST `/dialogues`**: เพิ่มบทพูดให้ตัวละครใน Shot
- **GET `/shots/{shot_id}/dialogues`**: รายการบทพูดทั้งหมดใน Shot นั้น
- **PATCH `/dialogues/{id}`**: แก้ไขบทพูด, ปรับ `tone` หรือ `pacing`
- **DELETE `/dialogues/{id}`**: ลบบทพูด

## 6. 👥 `Users` (`/api/v1/users`)
จัดการสมาชิกในระบบ
- **GET `/`**: รายชื่อผู้ใช้ทั้งหมด
- **GET `/{id}`**: ข้อมูลโปรไฟล์ส่วนตัว
- **PATCH `/{id}`**: แก้ไขข้อมูลสมาชิก
- **DELETE `/{id}`**: ลบสมาชิก

## 7. 🏢 `Tenants` (`/api/v1/tenants`)
จัดการค่ายและทีมงาน
- **POST `/`**: สร้างค่ายหนังใหม่
- **GET `/{id}`**: ข้อมูลค่ายและยอดคงเหลือ (`credit_balance`)
- **POST `/{tenant_id}/users`**: เพิ่มคนเข้าค่ายใหม่
- **GET `/{tenant_id}/users`**: รายชื่อคนในค่าย

## 8. 🗺️ `Locations` (`/api/v1/locations`)
สถานที่ถ่ายทำ
- **POST `/`**: เพิ่มสถานที่ใหม่
- **GET `/project/{project_id}`**: รายชื่อสถานที่ที่ใช้งานได้ในโปรเจกต์นี้
- **PATCH `/{id}`**: แก้ไขข้อมูลสถานที่
- **DELETE `/{id}`**: ลบสถานที่

## 9. 👤 `Characters` (`/api/v1/characters`)
ตัวละครในบทภาพยนตร์
- **POST `/`**: สร้างตัวละคร (ระบุ `project_id` และ `actor_id`)
- **GET `/project/{project_id}`**: รายชื่อตัวละครทั้งหมดที่มีในเรื่อง
- **PATCH `/{id}`**: แก้ไขข้อมูลตัวละคร

## 10. ⚙️ `Render-Jobs` (`/api/v1/render-jobs`)
ติดตามสถานะการเจนวิดีโอ
- **GET `/`**: รายการงานเรนเดอร์ทั้งหมด
- **GET `/{id}`**: เช็คสถานะงานรายตัว (`pending`, `processing`, `completed`, `failed`)
- **PATCH `/{id}`**: อัปเดตสถานะงาน (ใช้โดย Worker)

## 11. 💰 `Billing` (`/api/v1/billing`)
การเงินและ Transaction
- **POST `/{tenant_id}/top-up`**: เติมเครดิตเข้าค่าย
- **GET `/{tenant_id}/history`**: ดูประวัติรายการย้อนหลังทั้งหมด

---
**Interactive Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
