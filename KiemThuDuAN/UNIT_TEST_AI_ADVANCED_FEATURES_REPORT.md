# UNIT TESTING REPORT – Nguyễn Xuân Hải

Người thực hiện: Nguyễn Xuân Hải

## 1.1. Tools and Libraries

- **Testing framework:** `Jest 30` + `ts-jest`
- **Mocking libraries:** `jest.fn()`, `jest.mock()`, `jest.spyOn()`
- **Runtime support:** Node.js test environment
- **Coverage:** `jest --coverage` → output tại `coverage/unit`
- **Command chạy test:**
  - `yarn test`
  - `yarn test:coverage`

## 1.2. Scope of Testing

### ĐƯỢC kiểm thử

- `src/services/gorse.service.ts`
  - `toGorseUserId()`
  - `fromGorseUserId()`
  - `createUserPayload()`
  - `createFeedback()`
  - `insertUser()`
  - `getUser()`
  - `getRecommendations()`
  - `getPopularItems()`
  - `getLatestItems()`
- `src/services/ollamaSummary.service.ts`
  - `isAvailable()`
  - `generateBookSummary()`
- `src/services/ollamaEmbedding.service.ts`
  - `generateVector()`
  - `generateBatchVectors()`
- `src/services/gemini.service.ts`
  - `isConfigured()`
  - `generateBookSummary()`
- `src/services/qdrant.service.ts`
  - `initCollection()`
  - `upsertChunks()`
  - `searchSimilar()`
  - `syncBookToQdrant()`
  - `syncBookToQdrantNonBlocking()`
- `src/services/notification.service.ts`
  - `createNotification()`
  - `queueNotification()`
  - `queueBulkNotifications()`
  - `markAsRead()`
  - `deleteNotification()`
- `src/app/api/dashboard/stats/route.ts`
- `src/app/api/dashboard/alerts/route.ts`
- `src/app/api/dashboard/top-borrowed-books/route.ts`

### KHÔNG nên unit test trực tiếp

- `scripts/sync-gorse-data.ts`
  - Script ETL/migration, phù hợp hơn với integration test hoặc staging smoke test.
- `scripts/sync-book-qdrant.ts`
  - Phụ thuộc DB thật + embedding model + vector DB; unit test tại service layer là đủ.
- `src/workers/notification.worker.ts`
  - Có thể unit test thêm, nhưng hiện tại trọng tâm bài làm là business logic ở `NotificationService`; worker phù hợp cho integration test với BullMQ/Redis.
- **Performance testing end-to-end**
  - Không phải phạm vi chuẩn của unit test. Với phần này, unit test chỉ xác minh các “performance safeguards” như:
    - batch embedding giữ đúng thứ tự và không song song quá mức,
    - dashboard analytics gộp/sort dữ liệu đúng,
    - Qdrant non-blocking sync không làm vỡ request chính.

## 1.3. Unit Test Cases

### `tests/services/gorse.service.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_GORSE_01` | Mapping user ID nội bộ sang Gorse ID | `25` | `"user_25"` | Pure function |
| `TC_GORSE_02` | Parse ngược Gorse ID không hợp lệ | `"reader_25"` | `null` | Pure function |
| `TC_GORSE_03` | Tạo user payload mặc định | `userId=8` | `{ UserId, Labels: [], Comment: "" }` | Không gọi API |
| `TC_GORSE_04` | Tạo feedback đúng format | `userId=3, bookId=14, type=borrow` | Payload có `UserId=user_3`, `ItemId=book_14`, ISO timestamp | Không ghi DB |
| `TC_GORSE_05` | Sync user sang Gorse qua API | Payload hợp lệ | Promise resolve, `POST /api/user` | CheckDB = verify HTTP payload |
| `TC_GORSE_06` | Trả `null` khi user chưa tồn tại trong Gorse | `user_404` | `null` | Fallback an toàn |
| `TC_GORSE_07` | Fallback rỗng khi recommendation 404 | `user_99`, `n=5` | `[]` | Reliability case |
| `TC_GORSE_08` | Lấy popular items với query params đúng | `n=3`, `category=Novel` | Mảng popular items | Check query string |
| `TC_GORSE_09` | Không throw khi latest API lỗi | `n=4`, `offset=8` | `[]` | Reliability case |

### `tests/services/ollama.service.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_OLLAMA_01` | Health-check Ollama thành công | `list()` resolve | `true` | Mock client |
| `TC_OLLAMA_02` | Health-check Ollama thất bại | `list()` reject | `false` | Reliability case |
| `TC_OLLAMA_03` | Sinh summary tiếng Việt | `title=Doraemon`, `language=vi` | `success=true`, summary đã trim | Check prompt |
| `TC_OLLAMA_04` | Sinh summary tiếng Anh | `language=en` | `success=true` | Check prompt tiếng Anh |
| `TC_OLLAMA_05` | Bắt lỗi generate timeout | `generate()` reject | `success=false`, `error=timeout` | Reliability case |
| `TC_OLLAMA_06` | Chặn embedding input rỗng | `"   "` | Throw error | Validation case |
| `TC_OLLAMA_07` | Chuẩn hóa newline khi embedding | `"Line 1\nLine 2"` | Prompt `"Line 1 Line 2"` | Check payload |
| `TC_OLLAMA_08` | Giữ đúng thứ tự batch embeddings | `["alpha","beta"]` | `[[1],[2]]` | Performance safeguard |

### `tests/services/gemini.service.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_GEMINI_01` | Báo lỗi khi thiếu API key | `GEMINI_API_KEY=""` | `success=false`, có thông báo cấu hình | Security/config case |
| `TC_GEMINI_02` | Parse JSON dù có markdown fence | Response ` ```json ... ``` ` | `success=true`, summary đã parse | Mock SDK |
| `TC_GEMINI_03` | Bắt lỗi response không phải JSON | `text="not-json"` | `success=false`, có error | Reliability case |

### `tests/services/qdrant.service.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_QDRANT_01` | Tạo collection/index khi chưa tồn tại | `getCollections=[]` | `createCollection()`, `createPayloadIndex()` được gọi | Vector DB mocked |
| `TC_QDRANT_02` | Upsert vector chunks đúng payload | `bookId=10`, 1 chunk | `upsert()` có `book_id`, `content`, `uuid` | CheckDB tại Qdrant payload |
| `TC_QDRANT_03` | Search semantic có filter theo sách | `filterBookId=12` | Kết quả map đúng `score/content/bookId` | Query correctness |
| `TC_QDRANT_04` | Xóa vector của sách soft-delete | `isDeleted=true` | Gọi `delete()` thay vì embed lại | Rollback bằng mock |
| `TC_QDRANT_05` | Sync active book thành text/vector mới | Book hợp lệ | `generateVector()` nhận text chuẩn, sau đó delete + upsert | Main semantic indexing path |
| `TC_QDRANT_06` | Non-blocking sync nuốt lỗi đúng cách | `syncBookToQdrant()` throw | Promise resolve, chỉ log lỗi | Reliability safeguard |

### `tests/services/notification.service.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_NOTIFY_01` | Tạo notification hợp lệ | `userId=5`, title/message có khoảng trắng | Dữ liệu lưu DB đã trim, `UNREAD` | CheckDB tại Prisma mock |
| `TC_NOTIFY_02` | Không tạo notification cho user không tồn tại | `userId=404` | Throw `ValidationError` | Rollback bằng mock |
| `TC_NOTIFY_03` | Queue notification thường | Payload hợp lệ | `success=true`, `notificationId=77` | Check payload queue |
| `TC_NOTIFY_04` | Trả lỗi có cấu trúc khi queue input sai | `title=""` | `success=false`, error phù hợp | Validation case |
| `TC_NOTIFY_05` | Bulk queue loại user trùng và map priority | `userIds=[1,2,2,3]`, `HIGH` | 3 jobs unique, `JobPriority.HIGH` | Reliability/performance |
| `TC_NOTIFY_06` | Bỏ qua update khi notification đã READ | Notification READ | Không gọi `update()` | CheckDB tại Prisma mock |
| `TC_NOTIFY_07` | Soft delete notification | `notificationId=11` | `isDeleted=true` | Không xóa cứng dữ liệu |

### `tests/api/dashboard.routes.test.ts`

| Test Case ID | Test Objective | Input | Expected Output | Notes |
|---|---|---|---|---|
| `TC_DASH_01` | Trả về đủ 8 thống kê dashboard | Mock counts + aggregate | `data.stats` đúng số liệu | Dashboard & Analytics |
| `TC_DASH_02` | Dựng alert cards đúng count/severity/pluralization | overdue=2, pending=1, payment=0, maintenance=3 | 4 cards đúng nội dung | Dashboard & Analytics |
| `TC_DASH_03` | Gộp physical + ebook borrows và xếp hạng top books | 2 nguồn borrow có `bookId` trùng | Top books sort desc, rank đúng | Analytics aggregation |

## 1.4. Project Link

- Repository: `https://github.com/linhnt12/library-management-system`
- Unit test scripts:
  - `tests/services/gorse.service.test.ts`
  - `tests/services/ollama.service.test.ts`
  - `tests/services/gemini.service.test.ts`
  - `tests/services/qdrant.service.test.ts`
  - `tests/services/notification.service.test.ts`
  - `tests/api/dashboard.routes.test.ts`

## 1.5. Execution Report

- Lệnh chạy:
  - `yarn test`
  - `yarn test:coverage`
- Kết quả thực thi:
  - **Test Suites:** `6 passed, 6 total`
  - **Tests:** `36 passed, 36 total`
  - **Snapshots:** `0`
- Bằng chứng thực thi:
  - `KiemThuDuAN/test-artifacts/jest-test-output.txt`
  - `KiemThuDuAN/test-artifacts/jest-coverage-output.txt`
  - `coverage/unit/lcov-report/index.html`
- Ghi chú:
  - Coverage run có cảnh báo phụ từ `baseline-browser-mapping` đã cũ, nhưng không ảnh hưởng kết quả test.

## 1.6. Code Coverage Report

- Công cụ: Jest coverage (Istanbul)
- Thư mục report: `coverage/unit`
- Coverage tổng:
  - **Statements:** `71.12%`
  - **Branches:** `46.72%`
  - **Functions:** `72.88%`
  - **Lines:** `71.97%`
- Coverage nổi bật theo module:
  - `src/services/gemini.service.ts`: `100% statements`, `100% lines`
  - `src/services/ollamaSummary.service.ts`: `100% statements`, `100% lines`
  - `src/services/ollamaEmbedding.service.ts`: `88.88% statements`, `88.88% lines`
  - `src/services/qdrant.service.ts`: `80.64% statements`, `81.03% lines`
  - `src/app/api/dashboard/stats/route.ts`: `94.44% statements`, `94.44% lines`
  - `src/app/api/dashboard/alerts/route.ts`: `91.66% statements`, `91.66% lines`
  - `src/app/api/dashboard/top-borrowed-books/route.ts`: `87.5% statements`, `93.33% lines`
- Module cần mở rộng test thêm nếu muốn tăng coverage:
  - `src/services/gorse.service.ts`
  - `src/services/notification.service.ts`
- Ảnh chụp nên lấy tại:
  - `coverage/unit/lcov-report/index.html`
  - `KiemThuDuAN/test-artifacts/jest-coverage-output.txt`

## 1.7. Tài liệu tham khảo + danh sách prompt

### Tài liệu tham khảo

- Template Excel: `KiemThuDuAN/Bao_Cao_Unit_Test_HoanChinh.xlsx`
- Hướng dẫn nội bộ của môn học do bạn cung cấp
- Source code trong repo:
  - `src/services/gorse.service.ts`
  - `src/services/ollamaSummary.service.ts`
  - `src/services/ollamaEmbedding.service.ts`
  - `src/services/gemini.service.ts`
  - `src/services/qdrant.service.ts`
  - `src/services/notification.service.ts`
  - `src/app/api/dashboard/stats/route.ts`
  - `src/app/api/dashboard/alerts/route.ts`
  - `src/app/api/dashboard/top-borrowed-books/route.ts`

### Ghi chú

- Tài liệu này chỉ giữ vai trò ghi chú làm việc nội bộ. File nộp cuối cùng là workbook Excel đã cập nhật theo tên Nguyễn Xuân Hải.

## Ghi chú về CheckDB và Rollback

- Với các service có “ghi DB” hoặc “gọi external data store”, các test đều dùng mock để:
  - **CheckDB:** xác minh đúng payload/query/method đã được gửi tới Prisma, Gorse, Qdrant hoặc queue layer.
  - **Rollback:** không làm thay đổi DB/Qdrant/Gorse/Redis thật, nên trạng thái hệ thống luôn giữ nguyên sau test.
- Với performance testing đúng nghĩa (stress/load/benchmark), nên làm ở tầng riêng bằng k6/Artillery/JMeter; không nên gộp vào unit test report ngoài phần “performance safeguards”.
