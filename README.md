# Library Management System – Unit Tests

Framework: **Jest + ts-jest** (TypeScript)

## Cấu trúc thư mục
```
tests/
  services.test.ts       # Test Gorse AI & Ollama Summary Service
  gorse.service.test.ts  # Test chi tiết Gorse AI CRUD
  ollama.service.test.ts # Test chi tiết Ollama generate & embedding
  book.service.test.ts   # Test API Ebook CRUD (mock Prisma)
  dashboard.test.ts      # Test Dashboard Stats & Activities
  reliability.test.ts    # Test Tin cậy & Fallback mechanism
```

## Chạy tests
```bash
npx jest --preset ts-jest tests/ --coverage
```

## Kết quả
- Framework: Jest v29 + ts-jest
- Tổng số test: 21 cases
- Pass: 19 (90.5%)
- Fail: 2 (9.5% — bugs phát hiện)
- Coverage: ~80% trên các hàm được kiểm thử

## Yêu cầu môi trường
```bash
npm install --save-dev jest ts-jest @types/jest
```

## GitHub
https://github.com/Nxhaicr7/library-unit-tests
