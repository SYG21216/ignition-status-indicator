/**
 * Custom Perspective Components Bundle
 * Components:
 *   1. StatusIndicator  - LED style status indicator
 *   2. Gauge            - Circular arc gauge
 *   3. LineChart        - Multi-series line chart (SVG)
 *   4. BarChart         - Vertical/horizontal bar chart (SVG)
 *   5. StatCard         - KPI stat card
 *
 * Pure ES6 + React.createElement — no bundler or external libraries required.
 */

(function () {
    "use strict";

    const { Component, ComponentRegistry } = window.PerspectiveClient;
    const e = React.createElement;

    // ================================================================
    // SHARED UTILITIES
    // ================================================================

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function hexToRgb(hex) {
        if (!hex || !hex.startsWith("#")) return null;
        let h = hex.slice(1);
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
    }

    function makeGlow(color, size) {
        const rgb = hexToRgb(color);
        const sp  = Math.round(size * 0.6);
        const bl  = Math.round(size * 1.2);
        return rgb
            ? `0 0 ${bl}px ${sp}px rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`
            : `0 0 ${bl}px ${sp}px rgba(100,100,100,0.55)`;
    }

    // ================================================================
    // 1. STATUS INDICATOR
    // ================================================================

    const STATUS_COLORS = {
        ok:    "#22c55e",
        warn:  "#f59e0b",
        error: "#ef4444",
        off:   "#9ca3af"
    };

    class StatusIndicatorComponent extends Component {
        render() {
            const { props, emit } = this.props;
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

            const ledColor = (customColor && customColor.trim() !== "")
                ? customColor.trim()
                : (STATUS_COLORS[status] || STATUS_COLORS.off);

            const isHoriz = labelPosition === "left" || labelPosition === "right";
            const gap     = Math.max(4, Math.round(size * 0.3));

            const ledStyle = {
                display: "inline-block", width: size+"px", height: size+"px",
                borderRadius: "50%", backgroundColor: ledColor, flexShrink: 0,
                boxShadow: showGlow ? makeGlow(ledColor, size) : "none",
                animation: blink ? `si-blink ${(1/blinkSpeed).toFixed(2)}s ease-in-out infinite` : "none",
                transition: "background-color 0.3s ease, box-shadow 0.3s ease"
            };
            const labelStyle = {
                fontSize: fontSize+"px", color: fontColor,
                lineHeight: "1.2", userSelect: "none", whiteSpace: "nowrap"
            };
            const containerStyle = {
                display: "flex", flexDirection: isHoriz ? "row" : "column",
                alignItems: "center", justifyContent: "center",
                gap: gap+"px", width: "100%", height: "100%", boxSizing: "border-box"
            };

            const led   = e("span", { key:"led", style: ledStyle });
            const lbl   = (labelPosition !== "none" && label !== "")
                ? e("span", { key:"label", style: labelStyle }, label)
                : null;
            const before = labelPosition === "top" || labelPosition === "left";
            const children = lbl
                ? (before ? [lbl, led] : [led, lbl])
                : [led];

            return e("div", Object.assign({}, emit(), { style: containerStyle }), ...children);
        }
    }

    class StatusIndicatorMeta {
        getComponentType()  { return "com.example.perspective.statusindicator"; }
        getViewComponent()  { return StatusIndicatorComponent; }
        getDefaultSize()    { return { width: 120, height: 80 }; }
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

    // ================================================================
    // 2. GAUGE
    // ================================================================

    function polarToXY(cx, cy, r, angleDeg) {
        const rad = (angleDeg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function describeArc(cx, cy, r, startAngle, endAngle) {
        const s    = polarToXY(cx, cy, r, startAngle);
        const en   = polarToXY(cx, cy, r, endAngle);
        const diff = endAngle - startAngle;
        const large = (((diff % 360) + 360) % 360) > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${en.x} ${en.y}`;
    }

    function getThresholdColor(value, thresholds) {
        if (!thresholds || !thresholds.length) return "#22c55e";
        const sorted = [...thresholds].sort((a, b) => a.value - b.value);
        let color = sorted[0].color;
        for (const t of sorted) {
            if (value >= t.value) color = t.color;
        }
        return color;
    }

    class GaugeComponent extends Component {
        render() {
            const { props, emit } = this.props;
            const value        = props.value         !== undefined ? props.value : 0;
            const min          = props.min           !== undefined ? props.min   : 0;
            const max          = props.max           !== undefined ? props.max   : 100;
            const unit         = props.unit          !== undefined ? props.unit  : "%";
            const title        = props.title         !== undefined ? props.title : "Gauge";
            const thresholds   = props.thresholds    || [
                { value: 0,  color: "#22c55e" },
                { value: 60, color: "#f59e0b" },
                { value: 80, color: "#ef4444" }
            ];
            const showValue    = props.showValue     !== undefined ? props.showValue : true;
            const decPlaces    = props.decimalPlaces !== undefined ? props.decimalPlaces : 1;
            const arcWidth     = props.arcWidth      !== undefined ? props.arcWidth  : 16;
            const startAngle   = props.startAngle    !== undefined ? props.startAngle : -135;
            const endAngle     = props.endAngle      !== undefined ? props.endAngle   :  135;

            const pct        = clamp((value - min) / (max - min), 0, 1);
            const totalAngle = endAngle - startAngle;
            const valueAngle = startAngle + totalAngle * pct;
            const activeColor = getThresholdColor(value, thresholds);

            const vb   = 200;
            const cx   = vb / 2;
            const cy   = vb / 2;
            const r    = (vb / 2) - arcWidth - 8;

            const trackPath  = describeArc(cx, cy, r, startAngle, endAngle);
            const valuePath  = pct > 0 ? describeArc(cx, cy, r, startAngle, valueAngle) : null;

            const displayVal = Number(value).toFixed(decPlaces);

            const containerStyle = {
                width: "100%", height: "100%",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                boxSizing: "border-box", overflow: "hidden"
            };

            return e("div", Object.assign({}, emit(), { style: containerStyle }),
                e("svg", {
                    viewBox: `0 0 ${vb} ${vb}`,
                    style: { width: "100%", height: "100%", overflow: "visible" }
                },
                    // Track arc (background)
                    e("path", {
                        d: trackPath, fill: "none",
                        stroke: "#e5e7eb", strokeWidth: arcWidth,
                        strokeLinecap: "round"
                    }),
                    // Value arc
                    valuePath && e("path", {
                        d: valuePath, fill: "none",
                        stroke: activeColor, strokeWidth: arcWidth,
                        strokeLinecap: "round",
                        style: { transition: "stroke 0.4s ease, stroke-dashoffset 0.4s ease" }
                    }),
                    // Center value text
                    showValue && e("text", {
                        x: cx, y: cy + 4, textAnchor: "middle",
                        dominantBaseline: "middle",
                        fontSize: "32", fontWeight: "700", fill: "#111827"
                    }, displayVal + unit),
                    // Title
                    e("text", {
                        x: cx, y: vb - 14, textAnchor: "middle",
                        fontSize: "14", fill: "#6b7280"
                    }, title),
                    // Min label
                    (() => {
                        const p = polarToXY(cx, cy, r, startAngle);
                        return e("text", { x: p.x, y: p.y + 16, textAnchor: "middle", fontSize: "11", fill: "#9ca3af" }, String(min));
                    })(),
                    // Max label
                    (() => {
                        const p = polarToXY(cx, cy, r, endAngle);
                        return e("text", { x: p.x, y: p.y + 16, textAnchor: "middle", fontSize: "11", fill: "#9ca3af" }, String(max));
                    })()
                )
            );
        }
    }

    class GaugeMeta {
        getComponentType()  { return "com.example.perspective.gauge"; }
        getViewComponent()  { return GaugeComponent; }
        getDefaultSize()    { return { width: 200, height: 200 }; }
        getPropsReducer(tree) {
            return {
                value:        tree.readNumber("value",        0),
                min:          tree.readNumber("min",          0),
                max:          tree.readNumber("max",          100),
                unit:         tree.readString("unit",         "%"),
                title:        tree.readString("title",        "Gauge"),
                thresholds:   tree.read("thresholds",         [{ value:0, color:"#22c55e"},{value:60,color:"#f59e0b"},{value:80,color:"#ef4444"}]),
                showValue:    tree.readBoolean("showValue",   true),
                decimalPlaces:tree.readNumber("decimalPlaces",1),
                arcWidth:     tree.readNumber("arcWidth",     16),
                startAngle:   tree.readNumber("startAngle",  -135),
                endAngle:     tree.readNumber("endAngle",     135)
            };
        }
    }

    // ================================================================
    // 3. LINE CHART
    // ================================================================

    class LineChartComponent extends Component {
        render() {
            const { props, emit } = this.props;
            const series     = props.series     || [{ name:"Series A", color:"#3b82f6", data:[10,40,30,60,45,75,55] }];
            const labels     = props.labels     || [];
            const title      = props.title      || "Line Chart";
            const xLabel     = props.xAxisLabel || "";
            const yLabel     = props.yAxisLabel || "";
            const showDots   = props.showDots   !== undefined ? props.showDots   : true;
            const showGrid   = props.showGrid   !== undefined ? props.showGrid   : true;
            const showLegend = props.showLegend !== undefined ? props.showLegend : true;
            const smooth     = !!props.smooth;
            const fillArea   = !!props.fillArea;
            const bgColor    = props.backgroundColor || "#ffffff";

            // SVG dimensions
            const W = 500, H = 300;
            const padL = yLabel ? 52 : 44, padR = 16, padT = 36, padB = xLabel ? 48 : 36;
            const cW = W - padL - padR;
            const cH = H - padT - padB;

            // Flatten all data to find global min/max
            const allVals = series.flatMap(s => s.data || []);
            if (!allVals.length) {
                return e("div", Object.assign({}, emit(), {
                    style: { width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#9ca3af" }
                }), "No data");
            }

            const dataMin = Math.min(...allVals);
            const dataMax = Math.max(...allVals);
            const vRange  = dataMax - dataMin || 1;
            const maxPts  = Math.max(...series.map(s => (s.data||[]).length));

            function xPos(i) { return padL + (maxPts <= 1 ? cW/2 : (i / (maxPts - 1)) * cW); }
            function yPos(v) { return padT + cH - ((v - dataMin) / vRange) * cH; }

            function buildPath(data) {
                if (!data || !data.length) return "";
                if (!smooth) {
                    return data.map((v, i) => `${i===0?"M":"L"}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(" ");
                }
                // Catmull-Rom bezier approximation
                let d = `M${xPos(0).toFixed(1)},${yPos(data[0]).toFixed(1)}`;
                for (let i = 1; i < data.length; i++) {
                    const x0 = xPos(i-1), y0 = yPos(data[i-1]);
                    const x1 = xPos(i),   y1 = yPos(data[i]);
                    const cpx = (x0 + x1) / 2;
                    d += ` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
                }
                return d;
            }

            // Y grid lines
            const yTicks = 5;
            const gridLines = showGrid
                ? Array.from({ length: yTicks }, (_, i) => {
                    const v   = dataMin + (vRange / (yTicks - 1)) * i;
                    const y   = yPos(v);
                    return e("g", { key: "g"+i },
                        e("line", { x1: padL, y1: y, x2: padL+cW, y2: y, stroke:"#f3f4f6", strokeWidth:1 }),
                        e("text", { x: padL-6, y: y+4, textAnchor:"end", fontSize:"10", fill:"#9ca3af" },
                            Number(v).toFixed(1))
                    );
                })
                : [];

            // X labels
            const xTickEls = labels.map((lbl, i) => {
                if (maxPts <= 1) return null;
                const step = Math.max(1, Math.floor(maxPts / 8));
                if (i % step !== 0 && i !== maxPts-1) return null;
                return e("text", { key:"xl"+i, x: xPos(i), y: padT+cH+18, textAnchor:"middle", fontSize:"10", fill:"#9ca3af" }, lbl);
            });

            // Series paths + dots
            const seriesEls = series.map((s, si) => {
                const data  = s.data || [];
                const color = s.color || "#3b82f6";
                const path  = buildPath(data);

                const fillPath = fillArea && data.length
                    ? path + ` L${xPos(data.length-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL.toFixed(1)},${(padT+cH).toFixed(1)} Z`
                    : null;

                return e("g", { key:"s"+si },
                    fillPath && e("path", { d: fillPath, fill: color, fillOpacity: 0.12, stroke:"none" }),
                    e("path", { d: path, fill:"none", stroke: color, strokeWidth:2, strokeLinejoin:"round", strokeLinecap:"round" }),
                    showDots && data.map((v, i) =>
                        e("circle", { key:"d"+i, cx: xPos(i), cy: yPos(v), r:3, fill: color, stroke:"#fff", strokeWidth:1.5 })
                    )
                );
            });

            // Legend
            const legendEls = showLegend
                ? series.map((s, i) => e("g", { key:"leg"+i, transform:`translate(${padL + i*100}, ${H-10})` },
                    e("rect", { x:0, y:-7, width:12, height:3, fill: s.color||"#3b82f6", rx:1 }),
                    e("text", { x:16, y:0, fontSize:"10", fill:"#6b7280" }, s.name)
                ))
                : [];

            const containerStyle = {
                width:"100%", height:"100%", boxSizing:"border-box",
                backgroundColor: bgColor, overflow:"hidden"
            };

            return e("div", Object.assign({}, emit(), { style: containerStyle }),
                e("svg", { viewBox:`0 0 ${W} ${H}`, style:{ width:"100%", height:"100%" }, preserveAspectRatio:"xMidYMid meet" },
                    // Title
                    e("text", { x: W/2, y: 20, textAnchor:"middle", fontSize:"13", fontWeight:"600", fill:"#111827" }, title),
                    // Y axis label
                    yLabel && e("text", {
                        x: 12, y: padT + cH/2, textAnchor:"middle", fontSize:"10", fill:"#6b7280",
                        transform: `rotate(-90, 12, ${padT + cH/2})`
                    }, yLabel),
                    // X axis label
                    xLabel && e("text", { x: padL + cW/2, y: H-4, textAnchor:"middle", fontSize:"10", fill:"#6b7280" }, xLabel),
                    // Grid
                    ...gridLines,
                    // Axes
                    e("line", { x1:padL, y1:padT, x2:padL, y2:padT+cH, stroke:"#e5e7eb", strokeWidth:1 }),
                    e("line", { x1:padL, y1:padT+cH, x2:padL+cW, y2:padT+cH, stroke:"#e5e7eb", strokeWidth:1 }),
                    // X labels
                    ...xTickEls.filter(Boolean),
                    // Series
                    ...seriesEls,
                    // Legend
                    ...legendEls
                )
            );
        }
    }

    class LineChartMeta {
        getComponentType()  { return "com.example.perspective.linechart"; }
        getViewComponent()  { return LineChartComponent; }
        getDefaultSize()    { return { width: 500, height: 300 }; }
        getPropsReducer(tree) {
            return {
                series:          tree.read("series",          [{ name:"Series A", color:"#3b82f6", data:[10,40,30,60,45,75,55] }]),
                labels:          tree.read("labels",          ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]),
                title:           tree.readString("title",           "Line Chart"),
                xAxisLabel:      tree.readString("xAxisLabel",      ""),
                yAxisLabel:      tree.readString("yAxisLabel",      ""),
                showDots:        tree.readBoolean("showDots",        true),
                showGrid:        tree.readBoolean("showGrid",        true),
                showLegend:      tree.readBoolean("showLegend",      true),
                smooth:          tree.readBoolean("smooth",          false),
                fillArea:        tree.readBoolean("fillArea",        false),
                backgroundColor: tree.readString("backgroundColor",  "#ffffff")
            };
        }
    }

    // ================================================================
    // 4. BAR CHART
    // ================================================================

    class BarChartComponent extends Component {
        render() {
            const { props, emit } = this.props;
            const series      = props.series      || [{ name:"Series A", color:"#6366f1", data:[42,68,35,78,55,90,47] }];
            const labels      = props.labels      || [];
            const title       = props.title       || "Bar Chart";
            const orientation = props.orientation || "vertical";
            const stacked     = !!props.stacked;
            const showValues  = !!props.showValues;
            const showGrid    = props.showGrid    !== undefined ? props.showGrid    : true;
            const showLegend  = props.showLegend  !== undefined ? props.showLegend  : true;
            const barRadius   = props.barRadius   !== undefined ? props.barRadius   : 4;
            const bgColor     = props.backgroundColor || "#ffffff";

            const isVert = orientation !== "horizontal";
            const W = 500, H = 300;
            const padL = 44, padR = 16, padT = 36, padB = showLegend ? 48 : 36;
            const cW = W - padL - padR;
            const cH = H - padT - padB;

            const maxPts    = Math.max(...series.map(s => (s.data||[]).length));
            const allVals   = series.flatMap(s => s.data||[]);
            if (!allVals.length) {
                return e("div", Object.assign({}, emit(), {
                    style:{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:"#9ca3af" }
                }), "No data");
            }
            const dataMax = stacked
                ? Math.max(...Array.from({ length: maxPts }, (_, i) => series.reduce((sum, s) => sum + ((s.data||[])[i]||0), 0)))
                : Math.max(...allVals);
            const dataMax2 = dataMax || 1;

            const seriesCount = series.length;
            const groupPad    = 0.2;
            const groupW      = isVert ? (cW / maxPts) : (cH / maxPts);
            const innerW      = groupW * (1 - groupPad);
            const barW        = stacked ? innerW : innerW / seriesCount;

            function barEls() {
                const els = [];
                for (let i = 0; i < maxPts; i++) {
                    let stackOffset = 0;
                    series.forEach((s, si) => {
                        const v      = (s.data||[])[i] || 0;
                        const color  = s.color || "#6366f1";
                        const ratio  = v / dataMax2;
                        const groupX = isVert ? padL + (i / maxPts) * cW + groupW * groupPad / 2 : 0;
                        const groupY = isVert ? 0 : padT + (i / maxPts) * cH + groupW * groupPad / 2;

                        if (isVert) {
                            const bH   = ratio * cH;
                            const bX   = groupX + (stacked ? 0 : si * barW);
                            const bY   = padT + cH - bH - (stacked ? stackOffset * cH / dataMax2 : 0);
                            const r    = Math.min(barRadius, bH/2);
                            els.push(
                                e("rect", {
                                    key:`b${i}-${si}`, x:bX, y:bY, width:barW-2, height:bH,
                                    fill:color, rx:r, ry:r
                                }),
                                showValues && bH > 12 && e("text", {
                                    key:`v${i}-${si}`, x:bX+barW/2-1, y:bY-3,
                                    textAnchor:"middle", fontSize:"9", fill:"#374151"
                                }, v)
                            );
                        } else {
                            const bW2  = ratio * cW;
                            const bY2  = groupY + (stacked ? 0 : si * barW);
                            const bX2  = padL + (stacked ? stackOffset * cW / dataMax2 : 0);
                            const r    = Math.min(barRadius, bW2/2);
                            els.push(
                                e("rect", {
                                    key:`b${i}-${si}`, x:bX2, y:bY2, width:bW2, height:barW-2,
                                    fill:color, rx:r, ry:r
                                }),
                                showValues && bW2 > 20 && e("text", {
                                    key:`v${i}-${si}`, x:bX2+bW2+3, y:bY2+barW/2,
                                    dominantBaseline:"middle", fontSize:"9", fill:"#374151"
                                }, v)
                            );
                        }
                        if (stacked) stackOffset += v;
                    });

                    // Category label
                    const lbl = labels[i];
                    if (lbl) {
                        if (isVert) {
                            const lx = padL + (i / maxPts) * cW + groupW / 2;
                            els.push(e("text", { key:"xl"+i, x:lx, y:padT+cH+14, textAnchor:"middle", fontSize:"10", fill:"#9ca3af" }, lbl));
                        } else {
                            const ly = padT + (i / maxPts) * cH + groupW / 2;
                            els.push(e("text", { key:"yl"+i, x:padL-6, y:ly, textAnchor:"end", dominantBaseline:"middle", fontSize:"10", fill:"#9ca3af" }, lbl));
                        }
                    }
                }
                return els;
            }

            // Y grid
            const gridEls = showGrid && isVert
                ? Array.from({ length: 5 }, (_, i) => {
                    const v = (dataMax2 / 4) * i;
                    const y = padT + cH - (v / dataMax2) * cH;
                    return e("g", { key:"gy"+i },
                        e("line", { x1:padL, y1:y, x2:padL+cW, y2:y, stroke:"#f3f4f6", strokeWidth:1 }),
                        e("text", { x:padL-5, y:y+4, textAnchor:"end", fontSize:"10", fill:"#9ca3af" }, Math.round(v))
                    );
                })
                : [];

            const legendEls = showLegend
                ? series.map((s, i) => e("g", { key:"leg"+i, transform:`translate(${padL + i*100}, ${H-10})` },
                    e("rect", { x:0, y:-7, width:12, height:8, fill:s.color||"#6366f1", rx:2 }),
                    e("text", { x:16, y:0, fontSize:"10", fill:"#6b7280" }, s.name)
                ))
                : [];

            return e("div", Object.assign({}, emit(), {
                style:{ width:"100%", height:"100%", boxSizing:"border-box", backgroundColor:bgColor, overflow:"hidden" }
            }),
                e("svg", { viewBox:`0 0 ${W} ${H}`, style:{ width:"100%", height:"100%" }, preserveAspectRatio:"xMidYMid meet" },
                    e("text", { x:W/2, y:20, textAnchor:"middle", fontSize:"13", fontWeight:"600", fill:"#111827" }, title),
                    ...gridEls,
                    e("line", { x1:padL, y1:padT, x2:padL, y2:padT+cH, stroke:"#e5e7eb", strokeWidth:1 }),
                    e("line", { x1:padL, y1:padT+cH, x2:padL+cW, y2:padT+cH, stroke:"#e5e7eb", strokeWidth:1 }),
                    ...barEls().filter(Boolean),
                    ...legendEls
                )
            );
        }
    }

    class BarChartMeta {
        getComponentType()  { return "com.example.perspective.barchart"; }
        getViewComponent()  { return BarChartComponent; }
        getDefaultSize()    { return { width: 500, height: 300 }; }
        getPropsReducer(tree) {
            return {
                series:          tree.read("series",          [{ name:"Series A", color:"#6366f1", data:[42,68,35,78,55,90,47] }]),
                labels:          tree.read("labels",          ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]),
                title:           tree.readString("title",           "Bar Chart"),
                orientation:     tree.readString("orientation",     "vertical"),
                stacked:         tree.readBoolean("stacked",         false),
                showValues:      tree.readBoolean("showValues",      false),
                showGrid:        tree.readBoolean("showGrid",        true),
                showLegend:      tree.readBoolean("showLegend",      true),
                barRadius:       tree.readNumber("barRadius",        4),
                backgroundColor: tree.readString("backgroundColor",  "#ffffff")
            };
        }
    }

    // ================================================================
    // 5. STAT CARD
    // ================================================================

    const ICONS = {
        bolt:     "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
        temp:     "M12 2a3 3 0 0 0-3 3v8.27A6 6 0 1 0 15 13.27V5a3 3 0 0 0-3-3z",
        flow:     "M5 12h14M12 5l7 7-7 7",
        pressure: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4v4l3 3",
        power:    "M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10",
        speed:    "M12 2a10 10 0 1 0 0 20M12 12l4-4",
        count:    "M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z",
        alarm:    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
        check:    "M20 6L9 17l-5-5",
        none:     ""
    };

    const TREND_ICONS = {
        up:   "M12 19V5m0 0l-7 7m7-7 7 7",
        down: "M12 5v14m0 0l-7-7m7 7 7-7",
        flat: "M5 12h14"
    };

    class StatCardComponent extends Component {
        render() {
            const { props, emit } = this.props;
            const value       = props.value       !== undefined ? props.value : 0;
            const label       = props.label       !== undefined ? props.label : "Total Value";
            const unit        = props.unit        || "";
            const decPlaces   = props.decimalPlaces !== undefined ? props.decimalPlaces : 1;
            const trend       = props.trend       || "none";
            const trendValue  = props.trendValue  || "";
            const icon        = props.icon        || "none";
            const accentColor = props.accentColor || "#3b82f6";
            const bgColor     = props.backgroundColor || "#ffffff";
            const valueColor  = props.valueColor  || "#111827";
            const labelColor  = props.labelColor  || "#6b7280";
            const showBorder  = props.showBorder  !== undefined ? props.showBorder : true;

            const displayVal  = Number(value).toFixed(decPlaces);
            const trendColor  = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#9ca3af";
            const iconPath    = ICONS[icon] || "";
            const trendPath   = TREND_ICONS[trend] || "";

            const cardStyle = {
                width: "100%", height: "100%", boxSizing: "border-box",
                backgroundColor: bgColor, borderRadius: "10px",
                border: showBorder ? "1px solid #e5e7eb" : "none",
                padding: "16px",
                display: "flex", flexDirection: "column",
                justifyContent: "space-between", overflow: "hidden",
                fontFamily: "inherit"
            };

            const topRow = e("div", {
                style: { display:"flex", justifyContent:"space-between", alignItems:"flex-start" }
            },
                // Label
                e("span", { style:{ fontSize:"13px", color: labelColor, fontWeight:"500", lineHeight:"1.3" } }, label),
                // Icon badge
                icon !== "none" && iconPath && e("div", {
                    style:{
                        width:"34px", height:"34px", borderRadius:"8px",
                        backgroundColor: accentColor + "22",
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
                    }
                },
                    e("svg", { width:"18", height:"18", viewBox:"0 0 24 24", fill:"none",
                        stroke: accentColor, strokeWidth:"2", strokeLinecap:"round", strokeLinejoin:"round" },
                        e("path", { d: iconPath })
                    )
                )
            );

            const valueRow = e("div", {
                style: { display:"flex", alignItems:"baseline", gap:"4px", marginTop:"8px" }
            },
                e("span", { style:{ fontSize:"28px", fontWeight:"700", color: valueColor, lineHeight:"1" } }, displayVal),
                unit && e("span", { style:{ fontSize:"14px", color: labelColor, marginBottom:"2px" } }, unit)
            );

            const trendRow = trend !== "none"
                ? e("div", {
                    style:{ display:"flex", alignItems:"center", gap:"4px", marginTop:"6px" }
                },
                    e("svg", {
                        width:"14", height:"14", viewBox:"0 0 24 24", fill:"none",
                        stroke: trendColor, strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round"
                    },
                        e("path", { d: trendPath })
                    ),
                    trendValue && e("span", { style:{ fontSize:"12px", color: trendColor, fontWeight:"600" } }, trendValue)
                )
                : e("div", { style:{ height:"20px" } }); // spacer

            return e("div", Object.assign({}, emit(), { style: cardStyle }),
                topRow,
                valueRow,
                trendRow
            );
        }
    }

    class StatCardMeta {
        getComponentType()  { return "com.example.perspective.statcard"; }
        getViewComponent()  { return StatCardComponent; }
        getDefaultSize()    { return { width: 200, height: 130 }; }
        getPropsReducer(tree) {
            return {
                value:           tree.readNumber("value",           0),
                label:           tree.readString("label",           "Total Value"),
                unit:            tree.readString("unit",            ""),
                decimalPlaces:   tree.readNumber("decimalPlaces",   1),
                trend:           tree.readString("trend",           "none"),
                trendValue:      tree.readString("trendValue",      ""),
                icon:            tree.readString("icon",            "none"),
                accentColor:     tree.readString("accentColor",     "#3b82f6"),
                backgroundColor: tree.readString("backgroundColor", "#ffffff"),
                valueColor:      tree.readString("valueColor",      "#111827"),
                labelColor:      tree.readString("labelColor",      "#6b7280"),
                showBorder:      tree.readBoolean("showBorder",     true)
            };
        }
    }

    // ================================================================
    // REGISTER ALL COMPONENTS
    // ================================================================
    ComponentRegistry.register(new StatusIndicatorMeta());
    ComponentRegistry.register(new GaugeMeta());
    ComponentRegistry.register(new LineChartMeta());
    ComponentRegistry.register(new BarChartMeta());
    ComponentRegistry.register(new StatCardMeta());

    console.log("[CustomComponents] All 5 components registered successfully.");

})();
