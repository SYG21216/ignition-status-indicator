/**
 * StatusIndicator Perspective Component
 *
 * 파일: gateway/src/main/resources/mounted/js/statusindicator.js
 *
 * 이 파일은 순수 JavaScript (ES6+) + React.createElement API 를 사용하여
 * LED 스타일 상태 표시 컴포넌트를 구현합니다.
 *
 * 번들러(webpack/vite) 없이 Ignition 에서 직접 로드되므로,
 * window.PerspectiveClient 전역 객체를 통해 Component 와 ComponentRegistry 를 가져옵니다.
 *
 * ─────────────────────────────────────────────────────────────────
 * 컴포넌트 속성 (props.json 과 1:1 대응)
 * ─────────────────────────────────────────────────────────────────
 *  status         : "ok" | "warn" | "error" | "off"   (기본: "off")
 *  label          : string                              (기본: "Status")
 *  labelPosition  : "bottom"|"top"|"left"|"right"|"none"
 *  size           : number  (LED 지름, px)              (기본: 24)
 *  blink          : boolean                             (기본: false)
 *  blinkSpeed     : number  (Hz)                        (기본: 1.0)
 *  customColor    : string  (CSS color or "")           (기본: "")
 *  showGlow       : boolean                             (기본: true)
 *  fontSize       : number  (px)                        (기본: 13)
 *  fontColor      : string  (CSS color)                 (기본: "#333333")
 * ─────────────────────────────────────────────────────────────────
 */

(function () {
    "use strict";

    const { Component, ComponentRegistry } = window.PerspectiveClient;
    const e = React.createElement;

    // ──────────────────────────────────────────────────────────────
    // 상수
    // ──────────────────────────────────────────────────────────────

    /** status 값에 따른 기본 색상 */
    const STATUS_COLORS = {
        ok:    "#22c55e",   // green-500
        warn:  "#f59e0b",   // amber-500
        error: "#ef4444",   // red-500
        off:   "#9ca3af"    // gray-400
    };

    /** glow shadow 명도 조정 (rgba 알파값) */
    const GLOW_ALPHA = 0.55;

    // ──────────────────────────────────────────────────────────────
    // 유틸리티
    // ──────────────────────────────────────────────────────────────

    /**
     * 16진수 HEX 색상 → {r, g, b} 객체로 변환.
     * 짧은 형식(#RGB)도 지원합니다.
     */
    function hexToRgb(hex) {
        if (!hex || !hex.startsWith("#")) return null;
        let h = hex.slice(1);
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    /**
     * 주어진 색상으로 CSS box-shadow glow 문자열을 반환합니다.
     * HEX 이외의 색상(rgb(...), named 등)은 알파값 처리를 생략하고
     * 기본 rgba(0,0,0, α) 로 폴백합니다.
     */
    function makeGlowShadow(color, size) {
        const rgb = hexToRgb(color);
        const spread = Math.round(size * 0.6);
        const blur   = Math.round(size * 1.2);
        if (rgb) {
            return `0 0 ${blur}px ${spread}px rgba(${rgb.r},${rgb.g},${rgb.b},${GLOW_ALPHA})`;
        }
        return `0 0 ${blur}px ${spread}px rgba(100,100,100,${GLOW_ALPHA})`;
    }

    // ──────────────────────────────────────────────────────────────
    // StatusIndicator 컴포넌트 구현
    // ──────────────────────────────────────────────────────────────

    class StatusIndicatorComponent extends Component {

        render() {
            const { props, emit } = this.props;

            // ── 속성값 추출 (기본값 포함) ──────────────────────────
            const status        = props.status        || "off";
            const label         = props.label         !== undefined ? props.label : "Status";
            const labelPosition = props.labelPosition || "bottom";
            const size          = props.size          || 24;
            const blink         = !!props.blink;
            const blinkSpeed    = props.blinkSpeed    || 1.0;
            const customColor   = props.customColor   || "";
            const showGlow      = props.showGlow      !== undefined ? props.showGlow : true;
            const fontSize      = props.fontSize      || 13;
            const fontColor     = props.fontColor     || "#333333";

            // ── 색상 결정 ─────────────────────────────────────────
            const ledColor = (customColor && customColor.trim() !== "")
                ? customColor.trim()
                : (STATUS_COLORS[status] || STATUS_COLORS.off);

            // ── blink keyframe 애니메이션 이름 ─────────────────────
            const animationDuration = blink ? `${(1 / blinkSpeed).toFixed(2)}s` : "0s";

            // ── LED 원 스타일 ──────────────────────────────────────
            const ledStyle = {
                display:       "inline-block",
                width:         size + "px",
                height:        size + "px",
                borderRadius:  "50%",
                backgroundColor: ledColor,
                flexShrink:    0,
                boxShadow:     showGlow ? makeGlowShadow(ledColor, size) : "none",
                animation:     blink
                    ? `si-blink ${animationDuration} ease-in-out infinite`
                    : "none",
                transition:    "background-color 0.3s ease, box-shadow 0.3s ease"
            };

            // ── 레이블 스타일 ─────────────────────────────────────
            const labelStyle = {
                fontSize:   fontSize + "px",
                color:      fontColor,
                lineHeight: "1.2",
                userSelect: "none",
                whiteSpace: "nowrap"
            };

            // ── 컨테이너 플렉스 방향 ───────────────────────────────
            // labelPosition 에 따라 LED 와 레이블의 배치 순서를 결정합니다.
            const isHorizontal = (labelPosition === "left" || labelPosition === "right");
            const containerStyle = {
                display:        "flex",
                flexDirection:  isHorizontal ? "row" : "column",
                alignItems:     "center",
                justifyContent: "center",
                gap:            Math.max(4, Math.round(size * 0.3)) + "px",
                width:          "100%",
                height:         "100%",
                boxSizing:      "border-box"
            };

            // ── DOM 트리 조합 ──────────────────────────────────────
            const ledElement   = e("span", { key: "led",   style: ledStyle });
            const labelElement = (labelPosition !== "none" && label !== "")
                ? e("span", { key: "label", style: labelStyle }, label)
                : null;

            // 레이블이 LED 앞에 와야 하는 경우 (top, left)
            const before = (labelPosition === "top" || labelPosition === "left");
            const children = labelElement
                ? (before
                    ? [labelElement, ledElement]
                    : [ledElement, labelElement])
                : [ledElement];

            // emit() 은 Perspective 가 요구하는 이벤트 핸들러·스타일·ref 를 최상위 DOM 에 적용합니다.
            return e(
                "div",
                Object.assign({}, emit(), { style: containerStyle }),
                ...children
            );
        }
    }

    // ──────────────────────────────────────────────────────────────
    // ComponentMeta 정의
    // ──────────────────────────────────────────────────────────────

    class StatusIndicatorMeta {

        /**
         * Java 측 StatusIndicator.COMPONENT_ID 와 반드시 동일해야 합니다.
         */
        getComponentType() {
            return "com.example.perspective.statusindicator";
        }

        /** Perspective 가 캔버스에 컴포넌트를 드롭할 때 사용할 기본 크기 */
        getDefaultSize() {
            return { width: 120, height: 80 };
        }

        /** React 컴포넌트 클래스 반환 */
        getViewComponent() {
            return StatusIndicatorComponent;
        }

        /**
         * PropertyTree → props 변환 (렌더링 전 호출됨).
         * Java 측 props.json 에 정의된 속성들을 읽어 컴포넌트 props 로 전달합니다.
         */
        getPropsReducer(tree) {
            return {
                status:        tree.readString("status",        "off"),
                label:         tree.readString("label",         "Status"),
                labelPosition: tree.readString("labelPosition", "bottom"),
                size:          tree.readNumber("size",          24),
                blink:         tree.readBoolean("blink",        false),
                blinkSpeed:    tree.readNumber("blinkSpeed",    1.0),
                customColor:   tree.readString("customColor",   ""),
                showGlow:      tree.readBoolean("showGlow",     true),
                fontSize:      tree.readNumber("fontSize",      13),
                fontColor:     tree.readString("fontColor",     "#333333")
            };
        }
    }

    // ──────────────────────────────────────────────────────────────
    // 등록
    // ──────────────────────────────────────────────────────────────
    ComponentRegistry.register(new StatusIndicatorMeta());

    console.log("[StatusIndicator] Component registered successfully.");

})();
