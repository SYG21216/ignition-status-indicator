/**
 * Custom Perspective Components Bundle  v2.0
 * Grafana-style dashboard components for Ignition 8.3.x
 *
 * Components:
 *   1. StatusIndicator  – LED indicator
 *   2. Gauge            – Circular arc gauge (Grafana style)
 *   3. TimeSeries Panel – Line chart w/ tooltip, zoom/pan, crosshair
 *   4. Bar Chart Panel  – Bar chart w/ tooltip, legend toggle
 *   5. Stat Card        – KPI card
 *
 * ── Size-fix ──
 *   All root divs use:
 *     position:absolute; inset:0;  (fills Perspective slot exactly)
 *   SVG uses width="100%" height="100%" WITHOUT a fixed viewBox so it
 *   truly stretches to the container.  Pixel coords are computed from
 *   the element's measured clientWidth / clientHeight at render time.
 *
 * ── Grafana features implemented ──
 *   • Dark panel theme with header title + ⋮ menu placeholder
 *   • Tooltip  – hover crosshair + floating data card
 *   • Zoom     – drag to select X range, double-click to reset
 *   • Pan      – middle-mouse drag (or touch)
 *   • Legend   – click to toggle series visibility
 *   • Threshold lines on charts
 *   • Time-series X axis with smart time labels
 */

(function () {
    "use strict";

    const { Component, ComponentRegistry } = window.PerspectiveClient;
    const e = React.createElement;

    // ════════════════════════════════════════════════════════════════
    // SHARED HELPERS
    // ════════════════════════════════════════════════════════════════

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function niceNum(range, round) {
        const exp   = Math.floor(Math.log10(range));
        const f     = range / Math.pow(10, exp);
        let nf;
        if (round) {
            if (f < 1.5) nf = 1;
            else if (f < 3) nf = 2;
            else if (f < 7) nf = 5;
            else nf = 10;
        } else {
            if (f <= 1) nf = 1;
            else if (f <= 2) nf = 2;
            else if (f <= 5) nf = 5;
            else nf = 10;
        }
        return nf * Math.pow(10, exp);
    }

    /** Generate 5-6 nice Y tick values for [dataMin, dataMax] */
    function niceTicks(dataMin, dataMax, count) {
        count = count || 5;
        if (dataMin === dataMax) { dataMin -= 1; dataMax += 1; }
        const range  = niceNum(dataMax - dataMin, false);
        const step   = niceNum(range / (count - 1), true);
        const lo     = Math.floor(dataMin / step) * step;
        const hi     = Math.ceil(dataMax / step) * step;
        const ticks  = [];
        for (let v = lo; v <= hi + step * 0.5; v = Math.round((v + step) * 1e9) / 1e9) {
            ticks.push(v);
        }
        return ticks;
    }

    /** Format number compactly */
    function fmtNum(v, decimals) {
        if (decimals !== undefined) return Number(v).toFixed(decimals);
        if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
        if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "k";
        return Number(v).toFixed(Number.isInteger(v) ? 0 : 1);
    }

    /** Format epoch ms → time string */
    function fmtTime(ms) {
        const d = new Date(ms);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }

    function fmtDateTime(ms) {
        const d = new Date(ms);
        return d.toISOString().replace("T", " ").slice(0, 19);
    }

    /** HEX → rgba string */
    function hexAlpha(hex, a) {
        if (!hex || !hex.startsWith("#")) return `rgba(128,128,128,${a})`;
        let h = hex.slice(1);
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        const n = parseInt(h, 16);
        return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
    }

    // Grafana-style color palette
    const PALETTE = [
        "#73bf69","#f2cc0c","#ff780a","#f2495c","#5794f2",
        "#b877d9","#fade2a","#e02f44","#c4162a","#a352cc"
    ];

    // ════════════════════════════════════════════════════════════════
    // GRAFANA DARK PANEL WRAPPER
    // Renders the dark container + title bar around SVG charts
    // ════════════════════════════════════════════════════════════════

    /**
     * Wraps chart SVG content in a Grafana-style dark panel.
     * Usage: renderGrafanaPanel(emit, title, bgColor, contentFn)
     *   contentFn(W, H, svgRef) → SVG children array
     */
    function GrafanaPanel(props) {
        const { emitProps, title, bgColor, children } = props;
        const panelStyle = {
            position: "absolute", inset: 0,
            backgroundColor: bgColor || "#181b1f",
            borderRadius: "4px",
            border: "1px solid #2c3235",
            display: "flex", flexDirection: "column",
            overflow: "hidden", boxSizing: "border-box",
            fontFamily: "'Roboto', 'Inter', sans-serif"
        };
        const headerStyle = {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px 4px",
            flexShrink: 0
        };
        const titleStyle = {
            fontSize: "13px", fontWeight: 500, color: "#d8d9da",
            letterSpacing: "0.01em", margin: 0
        };
        const menuStyle = {
            fontSize: "18px", color: "#6c737a", cursor: "pointer",
            lineHeight: "1", padding: "0 2px", userSelect: "none"
        };
        const bodyStyle = {
            flex: 1, position: "relative", overflow: "hidden"
        };

        return e("div", Object.assign({}, emitProps, { style: panelStyle }),
            e("div", { style: headerStyle },
                e("span", { style: titleStyle }, title || ""),
                e("span", { style: menuStyle }, "⋮")
            ),
            e("div", { style: bodyStyle }, children)
        );
    }

    // ════════════════════════════════════════════════════════════════
    // TOOLTIP COMPONENT
    // ════════════════════════════════════════════════════════════════

    function TooltipBox({ x, y, items, containerW, containerH }) {
        const W = 180, H = 20 + items.length * 22 + 10;
        let left = x + 14;
        let top  = y - H / 2;
        if (left + W > containerW - 4) left = x - W - 14;
        if (top < 4) top = 4;
        if (top + H > containerH - 4) top = containerH - H - 4;

        const style = {
            position: "absolute", left: left+"px", top: top+"px",
            backgroundColor: "#1f2329", border: "1px solid #34383e",
            borderRadius: "4px", padding: "8px 10px",
            pointerEvents: "none", zIndex: 100,
            minWidth: "160px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        };
        const headerStyle = {
            display: "flex", justifyContent: "space-between",
            marginBottom: "6px"
        };

        return e("div", { style },
            items[0] && items[0].header && e("div", { style: headerStyle },
                e("span", { style:{ color:"#d8d9da", fontSize:"12px", fontWeight:600 } }, items[0].header),
                items[0].headerRight && e("span", { style:{ color:"#d8d9da", fontSize:"12px" } }, items[0].headerRight)
            ),
            items.map((item, i) => item.name !== undefined && e("div", {
                key: i,
                style:{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        gap:"8px", marginTop:"2px" }
            },
                e("div", { style:{ display:"flex", alignItems:"center", gap:"6px" } },
                    e("span", { style:{
                        display:"inline-block", width:"10px", height:"3px",
                        backgroundColor: item.color || "#73bf69",
                        borderRadius:"2px", flexShrink:0
                    }}),
                    e("span", { style:{ color:"#9fa7b3", fontSize:"11px" } }, item.name)
                ),
                e("span", { style:{ color:"#d8d9da", fontSize:"12px", fontWeight:600 } }, item.value)
            ))
        );
    }

    // ════════════════════════════════════════════════════════════════
    // 1. STATUS INDICATOR  (unchanged logic, size fix applied)
    // ════════════════════════════════════════════════════════════════

    const STATUS_COLORS = {
        ok:"#22c55e", warn:"#f59e0b", error:"#ef4444", off:"#9ca3af"
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
            const fontColor     = props.fontColor     || "#d8d9da";

            const ledColor = (customColor && customColor.trim() !== "")
                ? customColor.trim() : (STATUS_COLORS[status] || STATUS_COLORS.off);
            const isHoriz  = labelPosition === "left" || labelPosition === "right";
            const gap      = Math.max(4, Math.round(size * 0.3));

            const rootStyle = {
                position:"absolute", inset:0,
                display:"flex", flexDirection: isHoriz ? "row" : "column",
                alignItems:"center", justifyContent:"center",
                gap: gap+"px", boxSizing:"border-box", overflow:"hidden"
            };
            const ledStyle = {
                display:"inline-block", width:size+"px", height:size+"px",
                borderRadius:"50%", backgroundColor: ledColor, flexShrink:0,
                boxShadow: showGlow ? `0 0 ${size*1.2}px ${size*0.6}px ${hexAlpha(ledColor,0.55)}` : "none",
                animation: blink ? `si-blink ${(1/blinkSpeed).toFixed(2)}s ease-in-out infinite` : "none",
                transition:"background-color 0.3s, box-shadow 0.3s"
            };
            const labelStyle = {
                fontSize:fontSize+"px", color:fontColor,
                lineHeight:"1.2", userSelect:"none", whiteSpace:"nowrap"
            };
            const led = e("span", { key:"led", style:ledStyle });
            const lbl = (labelPosition !== "none" && label !== "")
                ? e("span", { key:"lbl", style:labelStyle }, label) : null;
            const before = labelPosition === "top" || labelPosition === "left";
            const kids = lbl ? (before ? [lbl,led] : [led,lbl]) : [led];
            return e("div", Object.assign({}, emit(), { style:rootStyle }), ...kids);
        }
    }
    class StatusIndicatorMeta {
        getComponentType()  { return "com.example.perspective.statusindicator"; }
        getViewComponent()  { return StatusIndicatorComponent; }
        getDefaultSize()    { return { width:120, height:80 }; }
        getPropsReducer(tree) {
            return {
                status:        tree.readString("status","off"),
                label:         tree.readString("label","Status"),
                labelPosition: tree.readString("labelPosition","bottom"),
                size:          tree.readNumber("size",24),
                blink:         tree.readBoolean("blink",false),
                blinkSpeed:    tree.readNumber("blinkSpeed",1.0),
                customColor:   tree.readString("customColor",""),
                showGlow:      tree.readBoolean("showGlow",true),
                fontSize:      tree.readNumber("fontSize",13),
                fontColor:     tree.readString("fontColor","#d8d9da")
            };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 2. GAUGE  (Grafana style — dark, arc, threshold zones)
    // ════════════════════════════════════════════════════════════════

    function polarXY(cx, cy, r, deg) {
        const rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function arcPath(cx, cy, r, a1, a2) {
        const s = polarXY(cx,cy,r,a1), en = polarXY(cx,cy,r,a2);
        const diff = ((a2-a1) % 360 + 360) % 360;
        const large = diff > 180 ? 1 : 0;
        return `M${s.x} ${s.y} A${r} ${r} 0 ${large} 1 ${en.x} ${en.y}`;
    }
    function thresholdColor(v, thresholds) {
        if (!thresholds || !thresholds.length) return "#73bf69";
        const s = [...thresholds].sort((a,b)=>a.value-b.value);
        let c = s[0].color;
        for (const t of s) { if (v >= t.value) c = t.color; }
        return c;
    }

    class GaugeComponent extends Component {
        render() {
            const { props, emit } = this.props;
            const value      = props.value      !== undefined ? props.value : 0;
            const min        = props.min        !== undefined ? props.min   : 0;
            const max        = props.max        !== undefined ? props.max   : 100;
            const unit       = props.unit       !== undefined ? props.unit  : "%";
            const title      = props.title      !== undefined ? props.title : "Gauge";
            const thresholds = props.thresholds || [{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}];
            const showValue  = props.showValue  !== undefined ? props.showValue : true;
            const decPlaces  = props.decimalPlaces !== undefined ? props.decimalPlaces : 1;
            const arcW       = props.arcWidth   !== undefined ? props.arcWidth : 18;
            const startAngle = props.startAngle !== undefined ? props.startAngle : -120;
            const endAngle   = props.endAngle   !== undefined ? props.endAngle   :  120;
            const bgColor    = props.backgroundColor || "#181b1f";

            const pct        = clamp((value - min)/(max - min), 0, 1);
            const totalAngle = endAngle - startAngle;
            const valueAngle = startAngle + totalAngle * pct;
            const color      = thresholdColor(value, thresholds);

            // Draw threshold colored arc zones
            const sorted = [...thresholds].sort((a,b)=>a.value-b.value);
            const zoneArcs = [];
            for (let i = 0; i < sorted.length; i++) {
                const zMin = sorted[i].value;
                const zMax = sorted[i+1] ? sorted[i+1].value : max;
                const zA1  = startAngle + totalAngle * clamp((zMin-min)/(max-min),0,1);
                const zA2  = startAngle + totalAngle * clamp((zMax-min)/(max-min),0,1);
                if (zA2 > zA1) {
                    zoneArcs.push({ path: arcPath(50,55,38-arcW/2, zA1, zA2), color: sorted[i].color });
                }
            }

            const rootStyle = {
                position:"absolute", inset:0,
                backgroundColor: bgColor, borderRadius:"4px",
                display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                overflow:"hidden", boxSizing:"border-box"
            };

            return e("div", Object.assign({}, emit(), { style: rootStyle }),
                title && e("div", {
                    style:{ fontSize:"13px", fontWeight:500, color:"#d8d9da",
                            position:"absolute", top:"10px", left:"12px" }
                }, title),
                e("svg", {
                    viewBox:"0 0 100 80", width:"100%", height:"100%",
                    style:{ maxWidth:"280px", maxHeight:"220px", overflow:"visible" }
                },
                    // Track
                    e("path", { d:arcPath(50,55,38-arcW/2,startAngle,endAngle),
                        fill:"none", stroke:"#2c3235", strokeWidth:arcW, strokeLinecap:"round" }),
                    // Zone arcs
                    ...zoneArcs.map((z,i) =>
                        e("path", { key:"z"+i, d:z.path,
                            fill:"none", stroke:z.color, strokeWidth:arcW,
                            strokeLinecap:"butt", opacity:0.35 })
                    ),
                    // Value arc
                    pct > 0 && e("path", {
                        d: arcPath(50,55,38-arcW/2,startAngle,valueAngle),
                        fill:"none", stroke:color, strokeWidth:arcW, strokeLinecap:"round",
                        style:{ filter:`drop-shadow(0 0 4px ${hexAlpha(color,0.8)})` }
                    }),
                    // Center value
                    showValue && e("text", {
                        x:50, y:54, textAnchor:"middle", dominantBaseline:"auto",
                        fontSize:"18", fontWeight:"700", fill:color
                    }, Number(value).toFixed(decPlaces) + unit),
                    // Min / Max labels
                    (() => { const p=polarXY(50,55,30,startAngle);
                        return e("text",{x:p.x,y:p.y+8,textAnchor:"middle",fontSize:"7",fill:"#6c737a"},String(min)); })(),
                    (() => { const p=polarXY(50,55,30,endAngle);
                        return e("text",{x:p.x,y:p.y+8,textAnchor:"middle",fontSize:"7",fill:"#6c737a"},String(max)); })()
                )
            );
        }
    }
    class GaugeMeta {
        getComponentType()  { return "com.example.perspective.gauge"; }
        getViewComponent()  { return GaugeComponent; }
        getDefaultSize()    { return { width:200, height:180 }; }
        getPropsReducer(tree) {
            return {
                value:        tree.readNumber("value",0),
                min:          tree.readNumber("min",0),
                max:          tree.readNumber("max",100),
                unit:         tree.readString("unit","%"),
                title:        tree.readString("title","Gauge"),
                thresholds:   tree.read("thresholds",[{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}]),
                showValue:    tree.readBoolean("showValue",true),
                decimalPlaces:tree.readNumber("decimalPlaces",1),
                arcWidth:     tree.readNumber("arcWidth",18),
                startAngle:   tree.readNumber("startAngle",-120),
                endAngle:     tree.readNumber("endAngle",120),
                backgroundColor: tree.readString("backgroundColor","#181b1f")
            };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 3. TIMESERIES PANEL
    //    • Dark Grafana theme
    //    • Tooltip with crosshair (vertical line + data values)
    //    • Zoom: drag to select X range; double-click to reset
    //    • Legend: click to toggle series
    //    • Threshold horizontal lines
    //    • Smart time-format X axis
    // ════════════════════════════════════════════════════════════════

    class TimeSeriesComponent extends Component {
        constructor(props) {
            super(props);
            this.state = {
                tooltip: null,       // { x, y, time, items }
                zoomRange: null,     // { minMs, maxMs }
                dragStart: null,     // { x, ms } for zoom drag
                dragCurrent: null,   // current drag X px
                hidden: {}           // { seriesName: true }
            };
            this._svgRef   = null;
            this._pad      = { l:52, r:16, t:36, b:50 };
        }

        // ── helpers ─────────────────────────────────────────────────

        _dims() {
            if (!this._svgRef) return { W:500, H:300, cW:432, cH:214 };
            const r = this._svgRef.getBoundingClientRect();
            const W = r.width  || 500;
            const H = r.height || 300;
            const p = this._pad;
            return { W, H, cW: W-p.l-p.r, cH: H-p.t-p.b };
        }

        _dataRange(series, zoomRange) {
            // Collect all timestamps
            const allMs = series.flatMap(s =>
                (s.points||[]).map(pt => typeof pt === "object" ? pt.t : null).filter(Boolean)
            );
            if (!allMs.length) return { minMs:0, maxMs:1, minV:0, maxV:1 };
            const globalMin = Math.min(...allMs);
            const globalMax = Math.max(...allMs);
            const minMs = zoomRange ? zoomRange.minMs : globalMin;
            const maxMs = zoomRange ? zoomRange.maxMs : globalMax;
            // Collect values in visible range
            const vals = series.flatMap(s =>
                (s.points||[])
                    .filter(pt => { const t = typeof pt==="object"?pt.t:null; return t>=minMs && t<=maxMs; })
                    .map(pt => typeof pt==="object" ? pt.v : pt)
            );
            const minV = vals.length ? Math.min(...vals) : 0;
            const maxV = vals.length ? Math.max(...vals) : 1;
            return { minMs, maxMs, minV, maxV };
        }

        // pixel → time ms
        _pxToMs(px, minMs, maxMs, cW) {
            return minMs + (px / cW) * (maxMs - minMs);
        }
        // time ms → pixel
        _msToX(ms, minMs, maxMs, cW, padL) {
            return padL + ((ms - minMs) / (maxMs - minMs)) * cW;
        }
        // value → pixel
        _vToY(v, minV, maxV, cH, padT) {
            const range = maxV - minV || 1;
            return padT + cH - ((v - minV) / range) * cH;
        }

        // ── event handlers ──────────────────────────────────────────

        _onMouseMove(evt, series, range) {
            if (!this._svgRef) return;
            const { W, H, cW, cH } = this._dims();
            const { minMs, maxMs, minV, maxV } = range;
            const p   = this._pad;
            const rect = this._svgRef.getBoundingClientRect();
            const mx  = evt.clientX - rect.left;
            const my  = evt.clientY - rect.top;
            if (mx < p.l || mx > p.l+cW) { this.setState({ tooltip:null }); return; }

            const hoverMs = this._pxToMs(mx - p.l, minMs, maxMs, cW);
            // Find closest point per series
            const items = series
                .filter(s => !this.state.hidden[s.name])
                .map(s => {
                    const pts = (s.points||[]);
                    let closest = null, bestDist = Infinity;
                    for (const pt of pts) {
                        const t = typeof pt==="object" ? pt.t : null;
                        if (t === null) continue;
                        const d = Math.abs(t - hoverMs);
                        if (d < bestDist) { bestDist = d; closest = pt; }
                    }
                    return closest ? {
                        name:  s.name,
                        color: s.color || PALETTE[0],
                        value: fmtNum(typeof closest==="object" ? closest.v : closest),
                        header: fmtDateTime(closest.t),
                        headerRight: null
                    } : null;
                })
                .filter(Boolean);

            if (!items.length) { this.setState({ tooltip:null }); return; }

            // Use first series' closest time for crosshair
            const firstPt = (series.find(s=>!this.state.hidden[s.name])?.points||[]).reduce((best, pt) => {
                const t = typeof pt==="object"?pt.t:null;
                if (t===null) return best;
                if (!best || Math.abs(t-hoverMs) < Math.abs(best.t-hoverMs)) return pt;
                return best;
            }, null);

            const cx = firstPt ? this._msToX(firstPt.t, minMs, maxMs, cW, p.l) : mx;

            this.setState({
                tooltip: { x: cx, y: my, items }
            });

            // zoom drag
            if (this.state.dragStart) {
                this.setState({ dragCurrent: mx });
            }
        }

        _onMouseLeave() {
            this.setState({ tooltip:null, dragStart:null, dragCurrent:null });
        }

        _onMouseDown(evt, minMs, maxMs) {
            if (!this._svgRef || evt.button !== 0) return;
            const { cW } = this._dims();
            const p    = this._pad;
            const rect = this._svgRef.getBoundingClientRect();
            const mx   = evt.clientX - rect.left;
            if (mx < p.l) return;
            const ms = this._pxToMs(mx - p.l, minMs, maxMs, cW);
            this.setState({ dragStart:{ x:mx, ms }, dragCurrent:mx });
            evt.preventDefault();
        }

        _onMouseUp(evt, minMs, maxMs) {
            const { dragStart, dragCurrent } = this.state;
            if (!dragStart) return;
            const { cW } = this._dims();
            const p = this._pad;
            const dx = Math.abs((dragCurrent||dragStart.x) - dragStart.x);
            if (dx > 8) {
                // commit zoom
                const rect = this._svgRef.getBoundingClientRect();
                const mx2  = evt.clientX - rect.left;
                const ms2  = this._pxToMs(mx2 - p.l, minMs, maxMs, cW);
                const lo   = Math.min(dragStart.ms, ms2);
                const hi   = Math.max(dragStart.ms, ms2);
                this.setState({ zoomRange:{ minMs:lo, maxMs:hi }, dragStart:null, dragCurrent:null });
            } else {
                this.setState({ dragStart:null, dragCurrent:null });
            }
        }

        _onDblClick() {
            this.setState({ zoomRange:null, tooltip:null });
        }

        _toggleSeries(name) {
            this.setState(prev => {
                const h = Object.assign({}, prev.hidden);
                h[name] = !h[name];
                return { hidden:h };
            });
        }

        // ── render ──────────────────────────────────────────────────

        render() {
            const { props, emit } = this.props;
            const series     = props.series     || [{ name:"cpu", color:"#73bf69",
                points:[
                    {t:Date.now()-300000,v:28},{t:Date.now()-240000,v:28},
                    {t:Date.now()-180000,v:29},{t:Date.now()-120000,v:45},
                    {t:Date.now()-60000, v:21},{t:Date.now(),       v:21}
                ]
            }];
            const title      = props.title      || "TimeSeries Panel";
            const bgColor    = props.backgroundColor || "#181b1f";
            const fillOpacity= props.fillOpacity !== undefined ? props.fillOpacity : 0.07;
            const lineWidth  = props.lineWidth   !== undefined ? props.lineWidth   : 2;
            const thLines    = props.thresholdLines || [];
            const { zoomRange, tooltip, dragStart, dragCurrent, hidden } = this.state;
            const p = this._pad;

            const range = this._dataRange(series, zoomRange);
            const { minMs, maxMs, minV, maxV } = range;
            const yTicks = niceTicks(minV, maxV, 5);

            // Time ticks for X axis
            const timeSpanMs   = maxMs - minMs || 1;
            const targetXTicks = 6;
            const msPerTick    = niceNum(timeSpanMs / targetXTicks, true);
            const firstTick    = Math.ceil(minMs / msPerTick) * msPerTick;
            const xTicks       = [];
            for (let t = firstTick; t <= maxMs; t += msPerTick) xTicks.push(t);

            const rootStyle = {
                position:"absolute", inset:0,
                backgroundColor: bgColor, borderRadius:"4px",
                border:"1px solid #2c3235",
                display:"flex", flexDirection:"column",
                overflow:"hidden", boxSizing:"border-box",
                fontFamily:"'Roboto','Inter',sans-serif"
            };
            const headerStyle = {
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"8px 12px 4px", flexShrink:0
            };
            const bodyStyle = {
                flex:1, position:"relative", overflow:"hidden",
                cursor: dragStart ? "ew-resize" : "crosshair"
            };

            // We use a ResizeSensor-free approach: render SVG with 100%/100%
            // and compute coords on-the-fly inside mousemove using getBoundingClientRect

            // Build series paths using viewBox="0 0 W H" computed from a fixed 500×300 budget
            // but the SVG itself is width=100% height=100% so it scales automatically.
            // We keep a virtual W/H for coord math and SVG content, using preserveAspectRatio=none
            // so the SVG stretches perfectly to fill its container.
            const VW = 500, VH = 300;
            const cVW = VW - p.l - p.r;
            const cVH = VH - p.t - p.b;

            function msToVX(ms) {
                return p.l + ((ms - minMs) / (maxMs - minMs)) * cVW;
            }
            function vToVY(v) {
                const range = (yTicks[yTicks.length-1]||maxV) - (yTicks[0]||minV) || 1;
                const lo = yTicks[0] !== undefined ? yTicks[0] : minV;
                return p.t + cVH - ((v - lo) / range) * cVH;
            }

            function buildLinePath(pts) {
                const vis = pts.filter(pt => {
                    const t = typeof pt==="object"?pt.t:null;
                    return t !== null && t >= minMs && t <= maxMs;
                });
                if (!vis.length) return "";
                return vis.map((pt,i) => {
                    const x = msToVX(typeof pt==="object"?pt.t:0);
                    const y = vToVY(typeof pt==="object"?pt.v:pt);
                    return `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
            }

            function buildFillPath(pts, path) {
                if (!path) return "";
                const vis = pts.filter(pt => {
                    const t = typeof pt==="object"?pt.t:null;
                    return t !== null && t >= minMs && t <= maxMs;
                });
                if (!vis.length) return "";
                const lastX = msToVX(vis[vis.length-1].t).toFixed(1);
                const firstX = msToVX(vis[0].t).toFixed(1);
                return path + ` L${lastX},${(p.t+cVH).toFixed(1)} L${firstX},${(p.t+cVH).toFixed(1)} Z`;
            }

            // Zoom selection rect (in virtual coords)
            let zoomRectEl = null;
            if (dragStart && dragCurrent !== null && this._svgRef) {
                const rect = this._svgRef.getBoundingClientRect();
                const scaleX = VW / (rect.width || VW);
                const x1v = (dragStart.x)  * scaleX;
                const x2v = dragCurrent    * scaleX;
                const rx  = Math.min(x1v, x2v);
                const rw  = Math.abs(x1v - x2v);
                zoomRectEl = e("rect", {
                    x:rx, y:p.t, width:rw, height:cVH,
                    fill:"rgba(255,255,255,0.08)", stroke:"rgba(255,255,255,0.3)",
                    strokeWidth:1, pointerEvents:"none"
                });
            }

            // Crosshair
            let crosshairEl = null;
            if (tooltip && this._svgRef) {
                const rect  = this._svgRef.getBoundingClientRect();
                const scaleX = VW / (rect.width || VW);
                const cx    = tooltip.x * scaleX;
                crosshairEl = e("line", {
                    x1:cx, y1:p.t, x2:cx, y2:p.t+cVH,
                    stroke:"rgba(255,255,255,0.3)", strokeWidth:1,
                    strokeDasharray:"4 3", pointerEvents:"none"
                });
            }

            const self = this;
            const svgEl = e("svg", {
                ref: r => { this._svgRef = r; },
                width:"100%", height:"100%",
                viewBox:`0 0 ${VW} ${VH}`,
                preserveAspectRatio:"none",
                style:{ display:"block", overflow:"visible" },
                onMouseMove:  (ev) => self._onMouseMove(ev, series, range),
                onMouseLeave: ()   => self._onMouseLeave(),
                onMouseDown:  (ev) => self._onMouseDown(ev, minMs, maxMs),
                onMouseUp:    (ev) => self._onMouseUp(ev, minMs, maxMs),
                onDoubleClick:()   => self._onDblClick()
            },
                // Background grid
                yTicks.map((v,i) => {
                    const y = vToVY(v);
                    return e("g", { key:"gy"+i },
                        e("line",{ x1:p.l, y1:y, x2:p.l+cVW, y2:y, stroke:"#2c3235", strokeWidth:1 }),
                        e("text",{ x:p.l-6, y:y+4, textAnchor:"end", fontSize:"11", fill:"#6c737a" }, fmtNum(v))
                    );
                }),
                xTicks.map((t,i) => {
                    const x = msToVX(t);
                    if (x < p.l || x > p.l+cVW) return null;
                    return e("g", { key:"gx"+i },
                        e("line",{ x1:x, y1:p.t, x2:x, y2:p.t+cVH, stroke:"#2c3235", strokeWidth:1 }),
                        e("text",{ x, y:p.t+cVH+16, textAnchor:"middle", fontSize:"10", fill:"#6c737a" }, fmtTime(t))
                    );
                }).filter(Boolean),
                // Threshold horizontal lines
                thLines.map((th,i) => {
                    const y = vToVY(th.value);
                    return e("g", { key:"th"+i },
                        e("line",{ x1:p.l, y1:y, x2:p.l+cVW, y2:y,
                            stroke: th.color||"#f2495c", strokeWidth:1, strokeDasharray:"6 3" }),
                        e("text",{ x:p.l+cVW+2, y:y+4, fontSize:"10", fill:th.color||"#f2495c" }, th.label||"")
                    );
                }),
                // Axes
                e("line",{ x1:p.l, y1:p.t, x2:p.l, y2:p.t+cVH, stroke:"#2c3235", strokeWidth:1 }),
                e("line",{ x1:p.l, y1:p.t+cVH, x2:p.l+cVW, y2:p.t+cVH, stroke:"#2c3235", strokeWidth:1 }),
                // Series
                ...series.map((s,si) => {
                    if (hidden[s.name]) return null;
                    const color = s.color || PALETTE[si % PALETTE.length];
                    const path  = buildLinePath(s.points||[]);
                    const fill  = buildFillPath(s.points||[], path);
                    return e("g", { key:"s"+si },
                        fill && e("path",{ d:fill, fill:color, fillOpacity:fillOpacity, stroke:"none" }),
                        path && e("path",{ d:path, fill:"none", stroke:color, strokeWidth:lineWidth,
                            strokeLinejoin:"round", strokeLinecap:"round" }),
                        // Dots
                        (s.points||[])
                            .filter(pt => { const t=typeof pt==="object"?pt.t:null; return t>=minMs&&t<=maxMs; })
                            .map((pt,i) => e("circle",{
                                key:"d"+i,
                                cx:msToVX(pt.t).toFixed(1),
                                cy:vToVY(pt.v).toFixed(1),
                                r:3, fill:color, stroke:"#181b1f", strokeWidth:1.5
                            }))
                    );
                }).filter(Boolean),
                zoomRectEl,
                crosshairEl
            );

            // Legend
            const legendEl = e("div", {
                style:{ display:"flex", flexWrap:"wrap", gap:"12px",
                        padding:"4px 12px 6px", flexShrink:0 }
            },
                series.map((s,i) => {
                    const color = s.color || PALETTE[i % PALETTE.length];
                    const dim   = !!hidden[s.name];
                    return e("div", {
                        key:"leg"+i,
                        onClick: () => this._toggleSeries(s.name),
                        style:{ display:"flex", alignItems:"center", gap:"6px",
                                cursor:"pointer", opacity: dim ? 0.35 : 1,
                                transition:"opacity 0.2s" }
                    },
                        e("span",{ style:{ display:"inline-block", width:"14px", height:"3px",
                            backgroundColor:color, borderRadius:"2px" }}),
                        e("span",{ style:{ fontSize:"12px", color:"#9fa7b3", userSelect:"none" } }, s.name)
                    );
                })
            );

            return e("div", Object.assign({}, emit(), { style:rootStyle }),
                e("div", { style:headerStyle },
                    e("span",{ style:{ fontSize:"13px", fontWeight:500, color:"#d8d9da" } }, title),
                    e("span",{ style:{ fontSize:"18px", color:"#6c737a", cursor:"pointer" } }, "⋮")
                ),
                e("div", { style:bodyStyle },
                    svgEl,
                    tooltip && e(TooltipBox, {
                        x: tooltip.x * (this._svgRef ? this._svgRef.getBoundingClientRect().width / VW : 1),
                        y: tooltip.y,
                        items: tooltip.items,
                        containerW: this._svgRef ? this._svgRef.getBoundingClientRect().width : 500,
                        containerH: this._svgRef ? this._svgRef.getBoundingClientRect().height : 300
                    }),
                    zoomRange && e("div", {
                        onClick: () => this._onDblClick(),
                        style:{ position:"absolute", top:"6px", right:"8px",
                                fontSize:"11px", color:"#f2cc0c", cursor:"pointer",
                                backgroundColor:"rgba(242,204,12,0.12)",
                                borderRadius:"3px", padding:"2px 6px" }
                    }, "⟳ Reset zoom")
                ),
                legendEl
            );
        }
    }

    class TimeSeriesMeta {
        getComponentType()  { return "com.example.perspective.timeseries"; }
        getViewComponent()  { return TimeSeriesComponent; }
        getDefaultSize()    { return { width:540, height:300 }; }
        getPropsReducer(tree) {
            const now = Date.now();
            return {
                series: tree.read("series", [{ name:"cpu", color:"#73bf69",
                    points:[
                        {t:now-300000,v:28},{t:now-240000,v:28},{t:now-180000,v:29},
                        {t:now-120000,v:45},{t:now-60000,v:21},{t:now,v:21}
                    ]
                }]),
                title:           tree.readString("title","TimeSeries Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                fillOpacity:     tree.readNumber("fillOpacity",0.07),
                lineWidth:       tree.readNumber("lineWidth",2),
                thresholdLines:  tree.read("thresholdLines",[])
            };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 4. BAR CHART PANEL  (Grafana style)
    //    • Dark theme, tooltip, legend toggle
    //    • Vertical bars with rounded tops
    //    • Hover highlights individual bar
    // ════════════════════════════════════════════════════════════════

    class BarChartComponent extends Component {
        constructor(props) {
            super(props);
            this.state = { tooltip:null, hidden:{}, hoverBar:null };
            this._svgRef = null;
        }

        _onMouseMove(evt, allBars) {
            if (!this._svgRef) return;
            const rect  = this._svgRef.getBoundingClientRect();
            const mx    = evt.clientX - rect.left;
            const my    = evt.clientY - rect.top;

            // Find which bar is hovered using virtual coords
            const VW = 500;
            const scaleX = VW / (rect.width || VW);
            const vmx = mx * scaleX;

            let found = null;
            for (const bar of allBars) {
                if (vmx >= bar.x && vmx <= bar.x + bar.w) { found = bar; break; }
            }
            if (found) {
                const items = [
                    { header: found.label, headerRight: found.seriesName },
                    { name: found.seriesName, color: found.color, value: String(found.v) }
                ];
                // additional props
                if (found.extraProps) {
                    for (const ep of found.extraProps) {
                        items.push({ name: ep.name, color:"", value: ep.value });
                    }
                }
                this.setState({ tooltip:{ x:mx, y:my, items }, hoverBar: found.id });
            } else {
                this.setState({ tooltip:null, hoverBar:null });
            }
        }

        _onMouseLeave() { this.setState({ tooltip:null, hoverBar:null }); }
        _toggleSeries(name) {
            this.setState(prev => {
                const h = Object.assign({}, prev.hidden);
                h[name] = !h[name];
                return { hidden:h };
            });
        }

        render() {
            const { props, emit } = this.props;
            const series      = props.series      || [{
                name:"cpu", color:"#73bf69",
                data:[
                    {label:"Server A",v:30,extraProps:[{name:"started",value:"2021-10-27 07:30"},{name:"level",value:"info"}]},
                    {label:"Server A",v:45},{label:"Server B",v:26},{label:"Server B",v:33},{label:"Server B",v:24}
                ]
            }];
            const title       = props.title       || "Bar Chart Panel";
            const bgColor     = props.backgroundColor || "#181b1f";
            const barRadius   = props.barRadius   !== undefined ? props.barRadius : 3;
            const showValues  = !!props.showValues;
            const { tooltip, hidden, hoverBar } = this.state;

            const VW = 500, VH = 300;
            const p  = { l:44, r:16, t:36, b:50 };
            const cW = VW - p.l - p.r;
            const cH = VH - p.t - p.b;

            // Flatten data for max value
            const visSeries = series.filter(s => !hidden[s.name]);
            const allVals   = visSeries.flatMap(s => (s.data||[]).map(d => typeof d==="object"?d.v:d));
            const dataMax   = allVals.length ? Math.max(...allVals) : 1;
            const yTicks    = niceTicks(0, dataMax, 5);
            const axisMax   = yTicks[yTicks.length-1] || dataMax || 1;

            // Compute max categories
            const maxCats  = Math.max(...series.map(s=>(s.data||[]).length), 1);
            const groupW   = cW / maxCats;
            const barW     = groupW * 0.7 / (visSeries.length || 1);
            const groupGap = groupW * 0.15;

            // Build bar metadata for hit-testing
            const allBars = [];
            visSeries.forEach((s, si) => {
                const color = s.color || PALETTE[si % PALETTE.length];
                (s.data||[]).forEach((d, di) => {
                    const v  = typeof d==="object" ? d.v : d;
                    const lbl= typeof d==="object" ? (d.label||String(di)) : String(di);
                    const bH = Math.max(0, (v / axisMax) * cH);
                    const bX = p.l + groupGap + di * groupW + si * barW;
                    const bY = p.t + cH - bH;
                    const id = `${si}-${di}`;
                    allBars.push({
                        id, x:bX, w:barW-2, y:bY, h:bH,
                        v, label:lbl, seriesName:s.name, color,
                        extraProps: typeof d==="object" ? d.extraProps : undefined
                    });
                });
            });

            // X category labels (deduplicated by position)
            const catLabels = [];
            for (let di = 0; di < maxCats; di++) {
                const cx = p.l + groupGap + di * groupW + groupW/2;
                const lbl = (series[0]?.data||[])[di];
                const txt = lbl ? (typeof lbl==="object"?lbl.label:String(di)) : "";
                catLabels.push({ x:cx, text:txt });
            }

            const self = this;
            const svgEl = e("svg", {
                ref: r => { this._svgRef = r; },
                width:"100%", height:"100%",
                viewBox:`0 0 ${VW} ${VH}`,
                preserveAspectRatio:"none",
                style:{ display:"block" },
                onMouseMove:  ev => self._onMouseMove(ev, allBars),
                onMouseLeave: ()  => self._onMouseLeave()
            },
                // Y grid
                yTicks.map((v,i) => {
                    const y = p.t + cH - (v / axisMax) * cH;
                    return e("g",{key:"gy"+i},
                        e("line",{x1:p.l,y1:y,x2:p.l+cW,y2:y,stroke:"#2c3235",strokeWidth:1}),
                        e("text",{x:p.l-5,y:y+4,textAnchor:"end",fontSize:"11",fill:"#6c737a"},fmtNum(v))
                    );
                }),
                // Axes
                e("line",{x1:p.l,y1:p.t,x2:p.l,y2:p.t+cH,stroke:"#2c3235",strokeWidth:1}),
                e("line",{x1:p.l,y1:p.t+cH,x2:p.l+cW,y2:p.t+cH,stroke:"#2c3235",strokeWidth:1}),
                // Bars
                allBars.map(bar => {
                    const r  = Math.min(barRadius, bar.h/2);
                    const dim = bar.h === 0;
                    const isHover = hoverBar === bar.id;
                    return e("g", { key:"b"+bar.id },
                        e("rect", {
                            x:bar.x, y:bar.y, width:bar.w, height:bar.h,
                            fill:bar.color,
                            fillOpacity: isHover ? 1 : 0.8,
                            rx:r, ry:r,
                            style:{ transition:"fill-opacity 0.1s" }
                        }),
                        showValues && bar.h > 14 && e("text",{
                            x:bar.x+bar.w/2, y:bar.y-3,
                            textAnchor:"middle", fontSize:"9", fill:"#d8d9da"
                        }, String(bar.v))
                    );
                }),
                // X labels
                catLabels.map((cl,i) =>
                    e("text",{ key:"xl"+i, x:cl.x, y:p.t+cH+16,
                        textAnchor:"middle", fontSize:"10", fill:"#6c737a" }, cl.text)
                )
            );

            const legendEl = e("div",{
                style:{ display:"flex",flexWrap:"wrap",gap:"12px",
                        padding:"4px 12px 6px",flexShrink:0 }
            },
                series.map((s,i) => {
                    const color = s.color||PALETTE[i%PALETTE.length];
                    const dim   = !!hidden[s.name];
                    return e("div",{
                        key:"leg"+i, onClick:()=>this._toggleSeries(s.name),
                        style:{ display:"flex",alignItems:"center",gap:"6px",
                                cursor:"pointer",opacity:dim?0.35:1,transition:"opacity 0.2s" }
                    },
                        e("span",{style:{display:"inline-block",width:"14px",height:"10px",
                            backgroundColor:color,borderRadius:"2px"}}),
                        e("span",{style:{fontSize:"12px",color:"#9fa7b3",userSelect:"none"}},s.name)
                    );
                })
            );

            const rootStyle = {
                position:"absolute", inset:0,
                backgroundColor:bgColor, borderRadius:"4px",
                border:"1px solid #2c3235",
                display:"flex", flexDirection:"column",
                overflow:"hidden", boxSizing:"border-box",
                fontFamily:"'Roboto','Inter',sans-serif"
            };

            return e("div", Object.assign({}, emit(), { style:rootStyle }),
                e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px 4px",flexShrink:0}},
                    e("span",{style:{fontSize:"13px",fontWeight:500,color:"#d8d9da"}},title),
                    e("span",{style:{fontSize:"18px",color:"#6c737a",cursor:"pointer"}},"⋮")
                ),
                e("div",{style:{flex:1,position:"relative",overflow:"hidden"}},
                    svgEl,
                    tooltip && e(TooltipBox,{
                        x:tooltip.x, y:tooltip.y, items:tooltip.items,
                        containerW: this._svgRef ? this._svgRef.getBoundingClientRect().width  : 500,
                        containerH: this._svgRef ? this._svgRef.getBoundingClientRect().height : 300
                    })
                ),
                legendEl
            );
        }
    }

    class BarChartMeta {
        getComponentType()  { return "com.example.perspective.barchart"; }
        getViewComponent()  { return BarChartComponent; }
        getDefaultSize()    { return { width:500, height:300 }; }
        getPropsReducer(tree) {
            return {
                series: tree.read("series",[{
                    name:"cpu", color:"#73bf69",
                    data:[
                        {label:"Server A",v:30},{label:"Server A",v:45},
                        {label:"Server B",v:26},{label:"Server B",v:33},{label:"Server B",v:24}
                    ]
                }]),
                title:           tree.readString("title","Bar Chart Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                barRadius:       tree.readNumber("barRadius",3),
                showValues:      tree.readBoolean("showValues",false)
            };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // 5. STAT CARD  (Grafana style)
    // ════════════════════════════════════════════════════════════════

    const ICONS_PATH = {
        bolt:"M13 2L3 14h9l-1 8 10-12h-9l1-8z",
        temp:"M12 2a3 3 0 0 0-3 3v8.27A6 6 0 1 0 15 13.27V5a3 3 0 0 0-3-3z",
        flow:"M5 12h14M12 5l7 7-7 7",
        power:"M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10",
        alarm:"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
        check:"M20 6L9 17l-5-5", none:""
    };
    const TREND_PATH = { up:"M12 19V5m0 0l-7 7m7-7 7 7", down:"M12 5v14m0 0l-7-7m7 7 7-7", flat:"M5 12h14" };

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
            const bgColor     = props.backgroundColor || "#181b1f";
            const valueColor  = props.valueColor  || "#d8d9da";
            const labelColor  = props.labelColor  || "#9fa7b3";
            const showBorder  = props.showBorder  !== undefined ? props.showBorder : true;

            const trendColor  = trend==="up"?"#73bf69":trend==="down"?"#f2495c":"#9fa7b3";
            const iconPath    = ICONS_PATH[icon] || "";
            const trendPath   = TREND_PATH[trend] || "";

            const rootStyle = {
                position:"absolute", inset:0,
                backgroundColor: bgColor, borderRadius:"4px",
                border: showBorder ? "1px solid #2c3235" : "none",
                padding:"16px",
                display:"flex", flexDirection:"column",
                justifyContent:"space-between", overflow:"hidden",
                boxSizing:"border-box", fontFamily:"'Roboto','Inter',sans-serif"
            };

            return e("div", Object.assign({}, emit(), { style:rootStyle }),
                e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
                    e("span",{style:{fontSize:"13px",color:labelColor,fontWeight:500,lineHeight:"1.3"}},label),
                    icon!=="none" && iconPath && e("div",{
                        style:{width:"32px",height:"32px",borderRadius:"6px",
                               backgroundColor:hexAlpha(accentColor,0.15),
                               display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}
                    },
                        e("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",
                            stroke:accentColor,strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},
                            e("path",{d:iconPath}))
                    )
                ),
                e("div",{style:{display:"flex",alignItems:"baseline",gap:"4px",marginTop:"8px"}},
                    e("span",{style:{fontSize:"28px",fontWeight:"700",color:valueColor,lineHeight:"1"}},
                        Number(value).toFixed(decPlaces)),
                    unit && e("span",{style:{fontSize:"14px",color:labelColor,marginBottom:"2px"}},unit)
                ),
                trend!=="none" && e("div",{style:{display:"flex",alignItems:"center",gap:"4px",marginTop:"6px"}},
                    e("svg",{width:"13",height:"13",viewBox:"0 0 24 24",fill:"none",
                        stroke:trendColor,strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round"},
                        e("path",{d:trendPath})),
                    trendValue && e("span",{style:{fontSize:"12px",color:trendColor,fontWeight:"600"}},trendValue)
                )
            );
        }
    }
    class StatCardMeta {
        getComponentType()  { return "com.example.perspective.statcard"; }
        getViewComponent()  { return StatCardComponent; }
        getDefaultSize()    { return { width:200, height:130 }; }
        getPropsReducer(tree) {
            return {
                value:           tree.readNumber("value",0),
                label:           tree.readString("label","Total Value"),
                unit:            tree.readString("unit",""),
                decimalPlaces:   tree.readNumber("decimalPlaces",1),
                trend:           tree.readString("trend","none"),
                trendValue:      tree.readString("trendValue",""),
                icon:            tree.readString("icon","none"),
                accentColor:     tree.readString("accentColor","#3b82f6"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                valueColor:      tree.readString("valueColor","#d8d9da"),
                labelColor:      tree.readString("labelColor","#9fa7b3"),
                showBorder:      tree.readBoolean("showBorder",true)
            };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // REGISTER  (TimeSeries replaces LineChart; BarChart updated)
    // ════════════════════════════════════════════════════════════════
    ComponentRegistry.register(new StatusIndicatorMeta());
    ComponentRegistry.register(new GaugeMeta());
    ComponentRegistry.register(new TimeSeriesMeta());
    ComponentRegistry.register(new BarChartMeta());
    ComponentRegistry.register(new StatCardMeta());

    console.log("[CustomComponents v2] 5 components registered.");

})();
