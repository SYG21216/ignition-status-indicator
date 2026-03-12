# Status Indicator — Ignition Perspective Custom Component

> **Ignition 8.3.3** 에서 동작하는 LED 스타일 상태 표시 Perspective 컴포넌트입니다.  
> `perspective-component-minimal` 예제를 베이스로 작성되었습니다.

---

## 📌 컴포넌트 기능

| 기능 | 설명 |
|------|------|
| LED 인디케이터 | 원형 LED 스타일 상태 표시 |
| 4가지 상태 | `ok` (초록) / `warn` (노랑) / `error` (빨강) / `off` (회색) |
| 레이블 | 텍스트 레이블 (위/아래/좌/우/없음 배치 가능) |
| 점멸 (Blink) | 속도 조절 가능한 점멸 애니메이션 |
| Glow 효과 | LED 주변 발광 효과 (on/off 가능) |
| 커스텀 색상 | `customColor` 속성으로 상태 색상 오버라이드 |
| 크기 조절 | `size` 속성으로 LED 직경 조절 (8px ~ 128px) |
| 폰트 커스터마이즈 | 레이블 글자 크기·색상 조절 |

---

## 🗂 프로젝트 구조

```
my-perspective-component/
├── build.gradle.kts                  ← 루트 빌드 (모듈 메타, 스코프 매핑)
├── settings.gradle.kts               ← Gradle 서브프로젝트 연결
├── gradle/
│   ├── libs.versions.toml            ← 의존성 버전 (Ignition 8.3.3)
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
│
├── common/                           ← Gateway + Designer 공통 (DG 스코프)
│   ├── build.gradle.kts
│   └── src/main/
│       ├── java/com/example/perspective/statusindicator/common/
│       │   ├── StatusIndicatorModule.java    ← 모듈 상수 (ID, URL_ALIAS, 브라우저 리소스)
│       │   └── comp/
│       │       └── StatusIndicator.java      ← ComponentDescriptor 정의
│       └── resources/
│           └── statusindicator.props.json    ← 속성 JSON Schema
│
├── gateway/                          ← Gateway 스코프
│   ├── build.gradle.kts
│   └── src/main/
│       ├── java/com/example/perspective/statusindicator/gateway/
│       │   └── StatusIndicatorGatewayHook.java  ← 컴포넌트 등록 + 정적 파일 서빙
│       └── resources/mounted/
│           ├── js/
│           │   └── statusindicator.js          ← React 컴포넌트 (순수 JS)
│           └── css/
│               └── statusindicator.css         ← blink 키프레임 + 기본 스타일
│
└── designer/                         ← Designer 스코프
    ├── build.gradle.kts
    └── src/main/java/com/example/perspective/statusindicator/designer/
        └── StatusIndicatorDesignerHook.java     ← 팔레트 등록
```

---

## 🔑 주요 ID 매핑

| 항목 | 값 |
|------|----|
| 모듈 ID | `com.example.perspective.statusindicator` |
| 컴포넌트 ID (Java & JS 공통) | `com.example.perspective.statusindicator` |
| URL 별칭 | `statusindicator` |
| JS 접근 경로 | `/res/statusindicator/js/statusindicator.js` |
| CSS 접근 경로 | `/res/statusindicator/css/statusindicator.css` |
| 팔레트 카테고리 | `Status Indicator` |

> ⚠️ Java 의 `StatusIndicator.COMPONENT_ID` 와 JavaScript 의 `getComponentType()` 반환값이  
> **반드시 동일**해야 Ignition 이 두 측면을 연결할 수 있습니다.

---

## 🛠 빌드 요구사항

| 항목 | 버전 |
|------|------|
| JDK | 17 이상 |
| Gradle | 8.2.1 (wrapper 사용) |
| Ignition SDK | 8.3.3 |

---

## ⚙️ 빌드 방법

```bash
# 프로젝트 루트에서 실행
./gradlew build

# 빌드 결과물 위치
# build/StatusIndicatorComponent-1.0.0-SNAPSHOT.modl
```

### 서명 없이 빌드 (개발용)

`build.gradle.kts` 에 이미 `skipModlSigning.set(true)` 가 설정되어 있어  
인증서 없이도 빌드가 가능합니다.

### 서명 빌드 (배포용)

1. `sign.props.example` → `sign.props` 복사
2. 키스토어 정보 입력
3. `build.gradle.kts` 에서 `skipModlSigning.set(true)` 제거

---

## 📦 설치 방법

1. `./gradlew build` 로 `.modl` 파일 생성
2. Ignition Gateway 웹 콘솔 → **Config > Modules** 접속
3. **Install or Upgrade a Module** 에서 `.modl` 파일 업로드
4. 라이선스 동의 후 설치 완료

---

## 🎨 Designer 에서 사용

1. Perspective 뷰 편집기 열기
2. 왼쪽 팔레트에서 **"Status Indicator"** 카테고리 확인
3. **"Status Indicator"** 컴포넌트를 캔버스로 드래그 앤 드롭
4. 속성 편집기에서 아래 속성 조정:

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `status` | string (enum) | `"off"` | ok / warn / error / off |
| `label` | string | `"Status"` | 레이블 텍스트 |
| `labelPosition` | string (enum) | `"bottom"` | bottom/top/left/right/none |
| `size` | integer | `24` | LED 직경 (px) |
| `blink` | boolean | `false` | 점멸 활성화 |
| `blinkSpeed` | number | `1.0` | 점멸 속도 (Hz) |
| `customColor` | color | `""` | 커스텀 색상 (비워두면 상태 색상 사용) |
| `showGlow` | boolean | `true` | 발광 효과 |
| `fontSize` | integer | `13` | 레이블 폰트 크기 (px) |
| `fontColor` | color | `"#333333"` | 레이블 색상 |

---

## 🔧 커스터마이즈 방법

### 모듈 ID / 이름 변경

모든 곳에서 일관성 있게 변경해야 합니다:

```
build.gradle.kts          → id.set(), name.set(), hooks.putAll()
StatusIndicatorModule.java → MODULE_ID, URL_ALIAS
StatusIndicator.java       → COMPONENT_ID
statusindicator.js         → getComponentType()
```

### 새 속성 추가

1. `statusindicator.props.json` 에 속성 추가
2. `statusindicator.js` 의 `getPropsReducer()` 에서 읽기 추가
3. `StatusIndicatorComponent.render()` 에서 렌더링 로직 추가

---

## 📝 참고 자료

- [Ignition SDK Docs](https://docs.inductiveautomation.com/docs/8.1/extending-ignition/developing-modules)
- [perspective-component-minimal 원본 예제](https://github.com/inductiveautomation/ignition-sdk-examples)
- [Ignition Module Tools (Gradle Plugin)](https://github.com/inductiveautomation/ignition-module-tools)
