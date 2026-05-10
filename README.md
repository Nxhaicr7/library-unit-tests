# Library Unit Tests

Bộ unit test cho các chức năng Recommendations, Vector Search, AI Summaries, Dashboard Analytics và Notifications của hệ thống quản lý thư viện.

## Chạy theo từng sheet
- `rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/gorse.service.test.ts tests/assessment/recommendations.assessment.test.ts`
- `rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/qdrant.service.test.ts tests/assessment/vector-search.assessment.test.ts`
- `rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/ollama.service.test.ts tests/services/gemini.service.test.ts tests/assessment/ai-summaries.assessment.test.ts`
- `rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/api/dashboard.routes.test.ts tests/api/dashboard.extended-routes.test.ts`
- `rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/notification.service.test.ts tests/workers/notification.worker.test.ts tests/assessment/notifications.assessment.test.ts`

## Tài liệu
- `KiemThuDuAN/14_unit_final_submit.xlsx`
- `KiemThuDuAN/COMMANDS.md`
