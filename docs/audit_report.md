# 🔍 Codebase Audit Report
**Date:** 2026-03-03 | **Scope:** Full system scan

---

## 🔴 CRITICAL — Security Issues

### S-1: `userService.list` เปิดข้อมูล User ทุุกคนอย่างไม่จำกัด
- **File:** `services.ts:751`
- **Problem:** `userService.list()` ดึง `*` จากตาราง `users` โดยไม่มี `tenant_id` filter ทำให้ทุกคนที่เรียก API นี้ได้เห็นรายชื่อ User ของทุก Studio
- **Fix:** เพิ่ม Tenant filter หรือลบทิ้งและใช้แค่ [listByTenant()](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#756-761) แทน

### S-2: `tenantService.list` ใช้ `ilike(email)` ดึง User Record
- **File:** `services.ts:119-130`
- **Problem:** ใช้ Email ในการ Query ตรงๆ ซึ่ง User สามารถแอบอ้าง Email คนอื่นเพื่อดู Studio ของคนอื่นได้ และยังไม่มี Server-side Auth ป้องกัน
- **Fix:** ควรใช้ Auth User ID จาก `supabase.auth.getUser()` แทน Email ในการ Join

### S-3: Hardcoded Emails ใน AuthContext
- **File:** `AuthContext.tsx:113`
- **Problem:** `'pichai.chin@gmail.com'` และ `'alpha@example.com'` ถูก Hardcode ไว้เป็น "Primary Users" ที่ได้รับการยกเว้นจาก Auto-Repair Logic ซึ่งไม่ปลอดภัยและไม่ Scalable
- **Fix:** ลบ Auto-Repair Logic นี้ออกและใช้ Structure ของ Database ที่ถูกต้องแทน หรือย้ายไปใช้ ENV variable

### S-4: `tenantService.delete` ไม่มี Auth Check
- **File:** `services.ts:162-164`
- **Problem:** ลบ Tenant ได้โดยไม่ตรวจสอบว่า User ที่ลบเป็น Owner ของ Tenant นั้นหรือเปล่า
- **Fix:** ตรวจสอบ `owner_id` หรือ Role ของ User ก่อนลบ

---

## 🟠 HIGH — Logic & Data Integrity Errors

### L-1: `projectService.delete` ไม่มี Cascading Delete
- **File:** `services.ts:97-103`
- **Problem:** ลบ Project โดยตรงโดยไม่ลบ Episodes, Scenes, Shots ที่อยู่ด้านใน จะติด Foreign Key Constraint Error
- **Fix:** ต้องไล่ลบ Episodes (→ Scenes → Shots → Dialogues/Jobs/Generations) ก่อน

### L-2: `characterService.delete` จะ Error ถ้าตัวละครอยู่ใน Dialogue
- **File:** `services.ts:544-551`
- **Problem:** ถ้า Character ถูกใช้งานใน `shot_dialogues.character_id` แล้ว จะลบไม่ได้เพราะ Foreign Key
- **Fix:** ต้อง NULL/ลบ Dialogues ที่อ้างถึง Character นั้นก่อน

### L-3: `locationService.delete` จะ Error ถ้า Location ถูกใช้ใน Scene
- **File:** `services.ts:729-734`
- **Problem:** ถ้า Location ถูกผูกกับ Scene (`scenes.location_id`) แล้ว จะลบไม่ได้
- **Fix:** ต้อง SET NULL บน `scenes.location_id` ที่เกี่ยวข้องก่อนลบ Location

### L-4: `actorService.delete` จะ Error ถ้า Actor ถูก Assign ให้ Character
- **File:** `services.ts:654-661`
- **Problem:** ถ้า Actor ถูกผูกกับ Character (`characters.actor_id`) จะลบไม่ได้
- **Fix:** ต้อง SET NULL บน `characters.actor_id` ที่เกี่ยวข้องก่อนลบ Actor

### L-5: `renderJobService.list` มี Dead Code
- **File:** `services.ts:793-800`
- **Problem:** Line 794 สร้าง `query` variable แต่ไม่ถูกใช้เลย เพราะ line 796 สร้าง Query ใหม่ทั้งหมดใน if-block และ return ค่าออกไปเลย ทำให้ `query` ที่ประกาศไว้เป็น Dead Code
- **Fix:** ลบ `let query = ...` บน line 794 ออก

### L-6: `reconcileCredit` ใน BillingService ไม่ Atomic
- **File:** `services.ts:840-858`
- **Problem:** การ Top-up เครดิตไม่ใช่ Atomic Transaction — ถ้า INSERT Transaction สำเร็จแต่ UPDATE Balance ล้มเหลว ข้อมูลจะ Inconsistent
- **Fix:** ใช้ Supabase RPC/Database Function แทนเพื่อทำทั้ง 2 อย่างใน Transaction เดียวกัน

### L-7: `sceneService.listByProject` ไม่มี [validateUUID](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9)
- **File:** `services.ts:215`
- **Problem:** [listByProject](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#702-713) ใน SceneService ข้าม [validateUUID](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9) ในขณะที่ Services อื่นๆ มีหมดแล้ว ไม่ Consistent
- **Fix:** เพิ่ม [validateUUID(projectId, ...)](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9) และ [validateUUID(tenantId, ...)](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9)

### L-8: `episodeService.update` ไม่มี [validateUUID](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9)
- **File:** `services.ts:344`
- **Problem:** เช่นเดียวกับข้อ L-7
- **Fix:** เพิ่ม [validateUUID(id, 'Episode ID')](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9) และ [validateUUID(tenantId, ...)](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#3-9)

### L-9: `dialogueService` ไม่มี Tenant Auth Check
- **File:** `services.ts:874-889`
- **Problem:** `dialogueService.create` และ [delete](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#771-775) ไม่มีการ Verify ว่า Shot ที่บันทึก Dialogue นั้นเป็นของ Tenant ที่ถูกต้อง
- **Fix:** เพิ่ม Tenant Ownership Check ผ่าน Shot → Scene → Project → Tenant

### L-10: `tenantService.create` ยังใส่ `tenant_id` ในตาราง `users`
- **File:** `services.ts:138-145`
- **Problem:** ยังมีการ Insert `tenant_id` ลงในตาราง `users` ซึ่งขัดกับ Architecture ที่ใหม่ที่ User ควรเชื่อมกับ Tenant ผ่าน `owner_id` ในตาราง `tenants` แทน
- **Fix:** ปรับ Data Model ให้ถูกต้อง

### L-11: [AuthContext](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/context/AuthContext.tsx#7-14) — Race Condition ระหว่าง [fetchSession](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/context/AuthContext.tsx#150-168) และ `onAuthStateChange`
- **File:** `AuthContext.tsx:149-191`
- **Problem:** ทั้ง [fetchSession](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/context/AuthContext.tsx#150-168) และ `onAuthStateChange` Listener ต่างก็เรียก [syncUser()](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/context/AuthContext.tsx#24-148) ซึ่งอาจเกิดการ Duplicate สร้าง Studio ถ้า Auth State เปลี่ยนเร็วมากๆ หรือ Network ช้า
- **Fix:** ใช้ Flag หรือ AbortController เพื่อป้องกัน Race Condition

### L-12: [Locations](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/app/locations/page.tsx#11-124) page - `loadProjects` มี dependency loop
- **File:** `locations/page.tsx:27`
- **Problem:** `useCallback` ของ `loadProjects` มี `selProject` ใน dependency array แต่ function นี้ก็ทำการ `setSelProject` ซึ่งจะทำให้ callback ถูกสร้างใหม่ทุกครั้ง ทำให้ `useEffect` ทำงานวนซ้ำ (Infinite Loop ในบางกรณี)
- **Fix:** ลบ `selProject` ออกจาก `useCallback` dependency (มี comment ใน CharactersPage แล้วว่าต้องทำ แต่ LocationsPage ยังไม่แก้)

---

## 🟡 MEDIUM — UX & Design Issues

### U-1: หน้า Project ไม่สามารถลบ Project ได้ (No Cascade)
- ดูข้อ L-1 — เมื่อ User กดลบ Project จะเห็น Error ที่ไม่ชัดเจน

### U-2: หน้า Characters ไม่มีปุ่ม Edit Character
- **File:** [characters/page.tsx](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/app/characters/page.tsx)
- **Problem:** มีแค่ Create และ Delete ไม่มี Edit — User ไม่สามารถแก้ไข Personality หรือ Outfit ของตัวละครได้

### U-3: หน้า Locations ไม่มีปุ่ม Edit/View Location
- **File:** [locations/page.tsx](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/app/locations/page.tsx)
- **Problem:** ไม่มีฟีเจอร์แก้ไขข้อมูล Location

### U-4: Billing Page — Top-Up ไม่มี Payment Integration จริง
- **File:** [billing/page.tsx](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/app/billing/page.tsx)
- **Problem:** กดปุ่ม Top Up แล้วเครดิตเพิ่มทันทีโดยไม่ผ่าน Payment Gateway — ไม่เหมาะกับ Production
- **Fix:** ต้อง Integrate Payment Gateway จริง (เช่น Stripe, Omise)

### U-5: Render Jobs ไม่แสดง Shot ที่เกี่ยวข้อง
- **File:** [render-jobs/page.tsx](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/app/render-jobs/page.tsx)
- **Problem:** แสดงแค่ `shot_id` (UUID) แต่ไม่แสดง Scene/Project ที่ Shot นั้นอยู่ ทำให้ User ไม่รู้ว่า Job นี้มาจากไหน

### U-6: Dashboard Stats ใช้ `projects.length` แต่ Query แค่ Limit 5
- **File:** `dashboard/page.tsx:40`
- **Problem:** Query projects ด้วย `.limit(5)` แต่แสดงตัวเลขในการ์ด "Total Projects" ทำให้ค่าที่แสดงอาจไม่แม่นยำ (แสดงสูงสุดแค่ 5 เสมอ)
- **Fix:** ทำ Count Query แยกต่างหาก

### U-7: [Sidebar](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/components/Sidebar.tsx#7-96) - Sidebar ไม่ได้ Mark Active สำหรับ Sub-routes
- **File:** `Sidebar.tsx:32`
- **Problem:** `const isActive = pathname === item.href` ใช้ Exact Match ทำให้ `/projects/[id]` ไม่ได้ Highlight เมนู Projects
- **Fix:** ใช้ `pathname.startsWith(item.href)` แทน (แต่ต้อง handle `/` case)

### U-8: Actor Page — AI Generate ยังไม่พร้อมใช้งาน แต่ปุ่มยังแสดงอยู่
- **File:** `actors/page.tsx:68`
- **Problem:** กดแล้วแสดง Error ว่า "ยังไม่พร้อม" แต่ปุ่มยังอยู่ในระบบ ทำให้ User งง
- **Fix:** ซ่อนปุ่ม AI Generate ออกหรือใส่ `disabled` พร้อม Tooltip อธิบาย

### U-9: `dialogueService` Error Format ไม่สม่ำเสมอ
- **File:** `services.ts:874-889`
- **Problem:** Services อื่นๆ `throw new Error(message)` แต่ `dialogueService` `throw { detail: message }` ทำให้ Error Handling ใน UI เรียก `.message` ไม่เจอ
- **Fix:** เปลี่ยนให้ `throw new Error(error.message)` เหมือนกันทั้งหมด

---

## 🔵 LOW — Code Quality

### C-1: `any` Types ใน AuthContext
- **File:** `AuthContext.tsx:8-9`
- **Problem:** `user: any` และ `userProfile: any | null` ทำให้ TypeScript ไม่ช่วย Auto-complete และง่ายต่อการเกิด Bug
- **Fix:** สร้าง Interface ที่ Typed ให้เหมาะสม

### C-2: [useToast](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/hooks/useToast.ts#3-11) ถูก Implement 2 ครั้ง
- **Problem:** มี [useToast](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/hooks/useToast.ts#3-11) hook ใน [hooks/useToast.ts](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/hooks/useToast.ts) แต่หน้า `projects/[id]/page.tsx` ประกาศ [useToast](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/hooks/useToast.ts#3-11) function ของตัวเองซ้ำอยู่ใน file เดียวกัน (line 30-33)
- **Fix:** ลบ Local [useToast](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/hooks/useToast.ts#3-11) ใน page.tsx ออกและ import จาก hooks แทน

### C-3: [ShotUpdate](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#403-414) interface ไม่มี `ai_prompt` field
- **File:** `services.ts:403-412`
- **Problem:** Database มีคอลัมน์ `ai_prompt` ใน `shots` table แต่ [ShotUpdate](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#403-414) interface ไม่มี field นี้ ทำให้ไม่สามารถ Update AI Prompt ผ่าน TypeScript ได้โดยตรง
- **Fix:** เพิ่ม `ai_prompt?: string | null` ใน [ShotUpdate](file:///Users/pichaichin/Sites/scene-core/scene-core-web/src/lib/services.ts#403-414)

---

## Summary

| Priority | Count | Category |
|----------|-------|----------|
| 🔴 Critical (Security) | 4 | S-1, S-2, S-3, S-4 |
| 🟠 High (Logic/Data) | 12 | L-1 ถึง L-12 |
| 🟡 Medium (UX) | 9 | U-1 ถึง U-9 |
| 🔵 Low (Code Quality) | 3 | C-1 ถึง C-3 |
| **รวม** | **28** | |
