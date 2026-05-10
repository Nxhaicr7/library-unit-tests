# Lệnh chạy bằng chứng unit test theo từng sheet

## U2. Recommendations
```bash
rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/gorse.service.test.ts tests/assessment/recommendations.assessment.test.ts
```

## U3. Vector Search
```bash
rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/qdrant.service.test.ts tests/assessment/vector-search.assessment.test.ts
```

## U4. AI Summaries
```bash
rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/ollama.service.test.ts tests/services/gemini.service.test.ts tests/assessment/ai-summaries.assessment.test.ts
```

## U5. Dashboard Analytics
```bash
rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/api/dashboard.routes.test.ts tests/api/dashboard.extended-routes.test.ts
```

## U6. Notifications Performance
```bash
rtk node scripts/run-jest-proof.js --config jest.sheets.config.ts --runInBand --verbose --silent --noStackTrace tests/services/notification.service.test.ts tests/workers/notification.worker.test.ts tests/assessment/notifications.assessment.test.ts
```
