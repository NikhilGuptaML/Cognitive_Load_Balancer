# Project File Structure

This document provides an overview of the key files and directories in the Cognitive Load Balancer project.

```text
CognitiveLoadBalancer/
├── backend/
│   ├── .venv/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── answer.py
│   │   ├── document.py
│   │   ├── question.py
│   │   ├── session.py
│   │   └── signal.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── difficulty_controller.py
│   │   ├── document_processor.py
│   │   ├── load_aggregator.py
│   │   └── session_manager.py
│   ├── data/
│   │   └── chroma/ (Vector database storage)
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py
│   │   └── models.py
│   ├── requirements.txt
│   └── main.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdaptationLog.tsx
│   │   │   ├── BandIndicator.tsx
│   │   │   ├── LoadGauge.tsx
│   │   │   ├── PomodoroTimer.tsx
│   │   │   └── QuizPanel.tsx
│   │   ├── context/
│   │   │   └── LoadScoreContext.tsx
│   │   ├── hooks/
│   │   │   ├── useKeystrokeAnalyzer.ts
│   │   │   └── useWebSocket.ts
│   │   ├── pages/
│   │   │   ├── ReportPage.tsx
│   │   │   ├── SessionPage.tsx
│   │   │   └── SetupPage.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
├── scripts/
│   └── setup.sh
├── README.md
└── file-structure.md
```

*Note: Dependency directories like `node_modules`, `dist`, and `__pycache__` have been omitted for clarity.*
