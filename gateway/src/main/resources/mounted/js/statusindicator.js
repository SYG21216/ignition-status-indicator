/**
 * Custom Perspective Components  v5.0
 *
 * Bug fixes vs v4:
 *   - TimeSeries zoomRect: dragCur stored in virtual SVG coords (not pixel),
 *     no longer depends on tooltip.cW
 *   - TimeSeries showDots: added to props.json + propsReducer
 *   - Gauge startAngle/endAngle: default -120/120 (matches props.json)
 *   - StatCard backgroundColor: default #181b1f (dark, matches props.json)
 *
 * New features:
 *   - TimeSeries: Y-axis label, dual Y-axis (right side), time-range picker
 *   - Gauge: needle style (none/line/arrow), valueFontSize prop
 *   - BarChart: horizontal orientation, stacked mode
 *   - StatCard: sparkline mini-chart background
 *
 * Sizing contract (unchanged from v4):
 *   emit() is spread onto the root element ONLY.
 *   No width/height in the extra style object — Perspective injects them.
 *   SVG uses viewBox="0 0 1000 600" preserveAspectRatio="none".
 *   All mouse coords via svgEl.getBoundingClientRect() → virtual space.
 */

(function () {
    "use strict";

    var CR  = window.PerspectiveClient.ComponentRegistry;
    var Cmp = window.PerspectiveClient.Component;
    var e   = React.createElement;

    /* ─────────────────────────────── UTILITIES ─────────────────────────────── */

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function niceNum(range, round) {
        if (!range || range === 0) return 1;
        var exp = Math.floor(Math.log10(Math.abs(range)));
        var f   = range / Math.pow(10, exp);
        var nf  = round
            ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
            : (f <= 1  ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
        return nf * Math.pow(10, exp);
    }

    function niceTicks(lo, hi, count) {
        count = count || 5;
        if (lo === hi) { lo -= 1; hi += 1; }
        var step  = niceNum((hi - lo) / (count - 1), true);
        var start = Math.floor(lo / step) * step;
        var ticks = [];
        for (var v = start; v <= hi + step * 0.5; v = Math.round((v + step) * 1e9) / 1e9)
            ticks.push(v);
        return ticks;
    }

    function fmtNum(v) {
        if (v === undefined || v === null || isNaN(v)) return "";
        var n = Number(v);
        if (Math.abs(n) >= 1e6)  return (n / 1e6).toFixed(1) + "M";
        if (Math.abs(n) >= 1e3)  return (n / 1e3).toFixed(1) + "k";
        return Number.isInteger(n) ? String(n) : n.toFixed(2);
    }

    function fmtTime(ms) {
        var d = new Date(ms);
        return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    }

    function fmtDateTime(ms) {
        return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
    }

    function pad2(n) { return n < 10 ? "0" + n : String(n); }

    function hexAlpha(hex, a) {
        if (!hex || hex.charAt(0) !== "#") return "rgba(128,128,128," + a + ")";
        var h = hex.slice(1);
        if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
        var n = parseInt(h, 16);
        return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
    }

    var PALETTE = ["#73bf69","#f2cc0c","#ff780a","#f2495c","#5794f2","#b877d9","#fade2a","#e02f44"];

    // TIME_RANGE_MS: named ranges → milliseconds
    var TIME_RANGE_MS = {
        "5m":  5*60*1000,     "15m": 15*60*1000,
        "30m": 30*60*1000,    "1h":  60*60*1000,
        "3h":  3*3600*1000,   "6h":  6*3600*1000,
        "12h": 12*3600*1000,  "24h": 24*3600*1000,
        "7d":  7*24*3600*1000
    };

    /* ──────────────────────────────── TOOLTIP ──────────────────────────────── */

    function TooltipBox(props) {
        var x     = props.x, y = props.y;
        var items = props.items, cW = props.cW, cH = props.cH;
        var TW = 190, TH = 22 + items.length * 22 + 10;
        var left = x + 16, top = y - TH / 2;
        if (left + TW > cW - 4) left = x - TW - 16;
        if (top < 4)            top  = 4;
        if (top + TH > cH - 4) top  = cH - TH - 4;

        return e("div", {
            style: {
                position:"absolute", left:left+"px", top:top+"px",
                backgroundColor:"#1f2329", border:"1px solid #34383e",
                borderRadius:"4px", padding:"8px 10px",
                pointerEvents:"none", zIndex:9999,
                minWidth:"160px", boxShadow:"0 4px 16px rgba(0,0,0,0.6)"
            }
        },
            (items[0] && items[0].header)
                ? e("div", { style:{color:"#d8d9da",fontSize:"12px",fontWeight:"600",
                    marginBottom:"6px",borderBottom:"1px solid #34383e",paddingBottom:"4px"}},
                    items[0].header)
                : null,
            items.filter(function(it){ return it.name !== undefined; })
                 .map(function(it, i) {
                return e("div", { key:i, style:{display:"flex",alignItems:"center",
                    justifyContent:"space-between",gap:"8px",marginTop:"3px"}},
                    e("div", {style:{display:"flex",alignItems:"center",gap:"6px"}},
                        it.color
                            ? e("span", {style:{display:"inline-block",width:"10px",height:"3px",
                                backgroundColor:it.color,borderRadius:"2px",flexShrink:0}})
                            : null,
                        e("span", {style:{color:"#9fa7b3",fontSize:"11px"}}, it.name)
                    ),
                    e("span", {style:{color:"#d8d9da",fontSize:"12px",fontWeight:"600"}}, it.value)
                );
            })
        );
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  1. STATUS INDICATOR
     * ═══════════════════════════════════════════════════════════════════════════ */

    var STATUS_COLORS = { ok:"#73bf69", warn:"#f2cc0c", error:"#f2495c", off:"#9ca3af" };

    class StatusIndicatorComponent extends Cmp {
        render() {
            var p     = this.props.props, emit = this.props.emit;
            var status = p.status        || "off";
            var label  = p.label         !== undefined ? p.label : "Status";
            var lpos   = p.labelPosition || "bottom";
            var size   = p.size          || 24;
            var blink  = !!p.blink;
            var bspd   = p.blinkSpeed    || 1.0;
            var custom = p.customColor   || "";
            var glow   = p.showGlow      !== undefined ? p.showGlow : true;
            var fs     = p.fontSize      || 13;
            var fc     = p.fontColor     || "#d8d9da";

            var color = (custom && custom.trim()) ? custom.trim() : (STATUS_COLORS[status] || STATUS_COLORS.off);
            var isH   = lpos === "left" || lpos === "right";
            var gap   = Math.max(4, Math.round(size * 0.3));

            var ledStyle = {
                display:"inline-block", width:size+"px", height:size+"px",
                borderRadius:"50%", backgroundColor:color, flexShrink:0,
                boxShadow: glow ? "0 0 "+(size*1.2)+"px "+(size*0.6)+"px "+hexAlpha(color,0.55) : "none",
                animation: blink ? "si-blink "+(1/bspd).toFixed(2)+"s ease-in-out infinite" : "none"
            };
            var lblEl = e("span", { style:{fontSize:fs+"px",color:fc,userSelect:"none",whiteSpace:"nowrap"}}, label);
            var ledEl = e("span", { style:ledStyle });

            return e("div", Object.assign({}, emit(), {
                style:{ display:"flex",
                    flexDirection: isH ? "row" : "column",
                    alignItems:"center", justifyContent:"center",
                    gap:gap+"px", overflow:"hidden", boxSizing:"border-box" }
            }),
                e("style", {}, "@keyframes si-blink{0%,100%{opacity:1}50%{opacity:0.15}}"),
                (lpos==="top"||lpos==="left") ? [lblEl, ledEl] : [ledEl, (lpos!=="none"&&label!=="") ? lblEl : null]
            );
        }
    }
    class StatusIndicatorMeta {
        getComponentType() { return "com.example.perspective.statusindicator"; }
        getViewComponent() { return StatusIndicatorComponent; }
        getDefaultSize()   { return { width:120, height:80 }; }
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

    /* ═══════════════════════════════════════════════════════════════════════════
     *  2. GAUGE  (+ needle, valueFontSize)
     * ═══════════════════════════════════════════════════════════════════════════ */

    function polarXY(cx, cy, r, deg) {
        var rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }
    function arcPath(cx, cy, r, a1, a2) {
        var s    = polarXY(cx, cy, r, a1);
        var en   = polarXY(cx, cy, r, a2);
        var diff = ((a2 - a1) % 360 + 360) % 360;
        return "M"+s.x.toFixed(2)+" "+s.y.toFixed(2)+
               " A"+r+" "+r+" 0 "+(diff>180?1:0)+" 1 "+en.x.toFixed(2)+" "+en.y.toFixed(2);
    }
    function threshColor(v, thr) {
        if (!thr || !thr.length) return "#73bf69";
        var s = thr.slice().sort(function(a,b){ return a.value-b.value; });
        var c = s[0].color;
        for (var i=0; i<s.length; i++) { if (v >= s[i].value) c = s[i].color; }
        return c;
    }

    class GaugeComponent extends Cmp {
        render() {
            var p     = this.props.props, emit = this.props.emit;
            var value   = p.value         !== undefined ? p.value         : 0;
            var min     = p.min           !== undefined ? p.min           : 0;
            var max     = p.max           !== undefined ? p.max           : 100;
            var unit    = p.unit          !== undefined ? p.unit          : "%";
            var title   = p.title         !== undefined ? p.title         : "Gauge";
            var thr     = p.thresholds    || [{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}];
            var showV   = p.showValue     !== undefined ? p.showValue     : true;
            var dec     = p.decimalPlaces !== undefined ? p.decimalPlaces : 1;
            var arcW    = p.arcWidth      !== undefined ? p.arcWidth      : 18;
            // FIX: default -120/120 (matches props.json)
            var sa      = p.startAngle    !== undefined ? p.startAngle    : -120;
            var ea      = p.endAngle      !== undefined ? p.endAngle      : 120;
            var needle  = p.needleStyle   || "none";
            var vfs     = p.valueFontSize !== undefined ? p.valueFontSize : 18;
            var bgColor = p.backgroundColor || "#181b1f";

            var pct    = clamp((value - min) / (max - min || 1), 0, 1);
            var va     = sa + (ea - sa) * pct;
            var color  = threshColor(value, thr);
            var sorted = thr.slice().sort(function(a,b){ return a.value-b.value; });

            var cx=50, cy=55, R=34;
            var pMin = polarXY(cx, cy, R-arcW*0.7, sa);
            var pMax = polarXY(cx, cy, R-arcW*0.7, ea);

            // Needle element
            var needleEl = null;
            if (needle !== "none") {
                var tip    = polarXY(cx, cy, R-2, va);
                var base1  = polarXY(cx, cy, 4, va + 90);
                var base2  = polarXY(cx, cy, 4, va - 90);
                if (needle === "line") {
                    needleEl = e("line", { x1:cx, y1:cy,
                        x2:tip.x.toFixed(2), y2:tip.y.toFixed(2),
                        stroke:"#ffffff", strokeWidth:2, strokeLinecap:"round" });
                } else { // arrow
                    needleEl = e("polygon", {
                        points: tip.x.toFixed(2)+","+tip.y.toFixed(2)+" "+
                                base1.x.toFixed(2)+","+base1.y.toFixed(2)+" "+
                                base2.x.toFixed(2)+","+base2.y.toFixed(2),
                        fill:"#ffffff", opacity:0.9
                    });
                }
            }

            return e("div", Object.assign({}, emit(), {
                style:{ boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center" }
            }),
                title ? e("div", { style:{
                    fontSize:"13px",fontWeight:500,color:"#d8d9da",
                    alignSelf:"flex-start",padding:"8px 12px 0" }}, title) : null,
                e("svg", {
                    viewBox:"0 0 100 80",
                    style:{ width:"100%", flex:1, overflow:"visible", maxWidth:"300px", maxHeight:"240px" }
                },
                    // track
                    e("path", { d:arcPath(cx,cy,R,sa,ea), fill:"none",
                        stroke:"#2c3235", strokeWidth:arcW, strokeLinecap:"round" }),
                    // zone arcs
                    sorted.map(function(t,i){
                        var zMax = sorted[i+1] ? sorted[i+1].value : max;
                        var zA1  = sa+(ea-sa)*clamp((t.value-min)/(max-min||1),0,1);
                        var zA2  = sa+(ea-sa)*clamp((zMax-min)/(max-min||1),0,1);
                        if (zA2 <= zA1) return null;
                        return e("path", { key:"z"+i, d:arcPath(cx,cy,R,zA1,zA2),
                            fill:"none", stroke:t.color, strokeWidth:arcW,
                            strokeLinecap:"butt", opacity:0.3 });
                    }),
                    // value arc
                    pct > 0 ? e("path", { d:arcPath(cx,cy,R,sa,va),
                        fill:"none", stroke:color, strokeWidth:arcW, strokeLinecap:"round",
                        style:{ filter:"drop-shadow(0 0 3px "+hexAlpha(color,0.8)+")" }}) : null,
                    // needle
                    needleEl,
                    // hub dot
                    needle !== "none"
                        ? e("circle", { cx:cx, cy:cy, r:3.5, fill:"#ffffff", opacity:0.9 }) : null,
                    // center text
                    showV ? e("text", { x:cx, y:cy, textAnchor:"middle",
                        dominantBaseline:"middle", fontSize:String(vfs),
                        fontWeight:"700", fill:color },
                        Number(value).toFixed(dec)+unit) : null,
                    // min / max labels
                    e("text", { x:pMin.x.toFixed(2), y:(pMin.y+6).toFixed(2),
                        textAnchor:"middle", fontSize:"7", fill:"#6c737a" }, String(min)),
                    e("text", { x:pMax.x.toFixed(2), y:(pMax.y+6).toFixed(2),
                        textAnchor:"middle", fontSize:"7", fill:"#6c737a" }, String(max))
                )
            );
        }
    }
    class GaugeMeta {
        getComponentType() { return "com.example.perspective.gauge"; }
        getViewComponent() { return GaugeComponent; }
        getDefaultSize()   { return { width:200, height:180 }; }
        getPropsReducer(tree) {
            return {
                value:          tree.readNumber("value",0),
                min:            tree.readNumber("min",0),
                max:            tree.readNumber("max",100),
                unit:           tree.readString("unit","%"),
                title:          tree.readString("title","Gauge"),
                thresholds:     tree.read("thresholds",[{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}]),
                showValue:      tree.readBoolean("showValue",true),
                decimalPlaces:  tree.readNumber("decimalPlaces",1),
                arcWidth:       tree.readNumber("arcWidth",18),
                startAngle:     tree.readNumber("startAngle",-120),
                endAngle:       tree.readNumber("endAngle",120),
                needleStyle:    tree.readString("needleStyle","none"),
                valueFontSize:  tree.readNumber("valueFontSize",18),
                backgroundColor:tree.readString("backgroundColor","#181b1f")
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  3. TIMESERIES PANEL  (full Grafana feature set v5)
     *     New in v5:
     *       - Y-axis label (left)
     *       - Dual Y-axis (right) per series yAxis property
     *       - Time-range picker (5m … 7d, or auto)
     *     Fixed in v5:
     *       - zoomRect stored in virtual SVG coords directly (no tooltip.cW dep)
     *       - showDots prop added
     * ═══════════════════════════════════════════════════════════════════════════ */

    var VW = 1000, VH = 600;
    // Padding for chart area inside SVG viewBox
    // Extra right pad when dual axis is enabled
    function tsPad(dualY, hasYLabel) {
        return { l: hasYLabel ? 72 : 58, r: dualY ? 58 : 20, t: 12, b: 42 };
    }

    class TimeSeriesComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state = {
                tooltip:    null,
                zoomRange:  null,
                // FIX: store drag in virtual SVG coords
                dragStartVX:null,   // virtual X at mouse-down
                dragCurVX:  null,   // virtual X at current mouse pos
                dragStartMs:null,   // ms at mouse-down
                hidden:     {}
            };
            this._svgEl = null;
        }

        // Convert SVG pixel coords to virtual SVG coords (0..VW, 0..VH)
        _toVirtual(svgEl, clientX, clientY) {
            var r = svgEl.getBoundingClientRect();
            return {
                vx: ((clientX - r.left) / r.width)  * VW,
                vy: ((clientY - r.top)  / r.height) * VH,
                pw: r.width,
                ph: r.height
            };
        }

        _computeRange(series, zoomRange, timeRange) {
            var allMs = [];
            series.forEach(function(s){
                (s.points||[]).forEach(function(p){ if(p.t) allMs.push(p.t); });
            });
            if (!allMs.length) return { minMs:0, maxMs:1 };
            var gMax = Math.max.apply(null, allMs);
            var gMin = Math.min.apply(null, allMs);

            if (zoomRange) return { minMs:zoomRange.minMs, maxMs:zoomRange.maxMs };
            if (timeRange && TIME_RANGE_MS[timeRange]) {
                return { minMs: gMax - TIME_RANGE_MS[timeRange], maxMs: gMax };
            }
            return { minMs:gMin, maxMs:gMax };
        }

        render() {
            var p    = this.props.props, emit = this.props.emit, self = this;
            var series      = p.series     || [{ name:"cpu", color:"#73bf69", yAxis:0,
                points:(function(){ var now=Date.now(); return [
                    {t:now-300000,v:28},{t:now-240000,v:28},{t:now-180000,v:29},
                    {t:now-120000,v:45},{t:now-60000, v:21},{t:now,v:21}]; })() }];
            var title       = p.title           || "TimeSeries Panel";
            var fillOp      = p.fillOpacity      !== undefined ? p.fillOpacity  : 0.07;
            var lw          = p.lineWidth        !== undefined ? p.lineWidth    : 2;
            var showDots    = p.showDots         !== undefined ? p.showDots     : true;  // FIX
            var smooth      = !!p.smooth;
            var dualY       = !!p.dualYAxis;
            var yLabel      = p.yAxisLabel       || "";
            var y2Label     = p.y2AxisLabel      || "";
            var timeRange   = p.timeRange        || "auto";
            var thLines     = p.thresholdLines   || [];
            var bgColor     = p.backgroundColor  || "#181b1f";

            var st = this.state;
            var pad = tsPad(dualY, !!yLabel);
            var cW  = VW - pad.l - pad.r;
            var cH  = VH - pad.t - pad.b;

            var msRange  = this._computeRange(series, st.zoomRange, timeRange==="auto"?null:timeRange);
            var minMs    = msRange.minMs, maxMs = msRange.maxMs;

            // Separate series by yAxis
            var leftSeries  = series.filter(function(s){ return !s.yAxis || s.yAxis===0; });
            var rightSeries = dualY ? series.filter(function(s){ return s.yAxis===1; }) : [];

            function axisRange(ss) {
                var vals = [];
                ss.forEach(function(s){
                    (s.points||[]).forEach(function(p){
                        if(p.t>=minMs&&p.t<=maxMs) vals.push(p.v);
                    });
                });
                if (!vals.length) return { min:0, max:1 };
                return { min:Math.min.apply(null,vals), max:Math.max.apply(null,vals) };
            }

            var leftR  = axisRange(leftSeries.length  ? leftSeries  : series);
            var rightR = dualY ? axisRange(rightSeries) : leftR;
            var lTicks = niceTicks(leftR.min,  leftR.max,  5);
            var rTicks = dualY ? niceTicks(rightR.min, rightR.max, 5) : lTicks;
            var lMin = lTicks[0], lMax = lTicks[lTicks.length-1];
            var rMin = rTicks[0], rMax = rTicks[rTicks.length-1];

            function msToX(ms) { return pad.l + ((ms-minMs)/(maxMs-minMs||1)) * cW; }
            function vToYLeft(v)  { return pad.t + cH - ((v-lMin)/(lMax-lMin||1)) * cH; }
            function vToYRight(v) { return pad.t + cH - ((v-rMin)/(rMax-rMin||1)) * cH; }
            function vToY(s, v) {
                return (dualY && s.yAxis===1) ? vToYRight(v) : vToYLeft(v);
            }

            // X-ticks
            var span      = maxMs - minMs || 1;
            var msPerTick = niceNum(span / 6, true);
            var firstTick = Math.ceil(minMs / msPerTick) * msPerTick;
            var xTicks    = [];
            for (var t0=firstTick; t0<=maxMs; t0+=msPerTick) xTicks.push(t0);

            function buildPath(s) {
                var pts = (s.points||[]).filter(function(p){ return p.t>=minMs&&p.t<=maxMs; });
                if (!pts.length) return "";
                if (!smooth) return pts.map(function(p,i){
                    return (i===0?"M":"L")+msToX(p.t).toFixed(1)+","+vToY(s,p.v).toFixed(1);
                }).join(" ");
                var d = "M"+msToX(pts[0].t).toFixed(1)+","+vToY(s,pts[0].v).toFixed(1);
                for (var i=1; i<pts.length; i++) {
                    var x0=msToX(pts[i-1].t), y0=vToY(s,pts[i-1].v);
                    var x1=msToX(pts[i].t),   y1=vToY(s,pts[i].v), cx=(x0+x1)/2;
                    d+=" C"+cx.toFixed(1)+","+y0.toFixed(1)+" "+cx.toFixed(1)+","+y1.toFixed(1)+" "+x1.toFixed(1)+","+y1.toFixed(1);
                }
                return d;
            }

            var tooltip = st.tooltip;

            // ── Zoom rect (FIX: stored in virtual coords, no tooltip dependency) ──
            var zoomRectEl = null;
            if (st.dragStartVX !== null && st.dragCurVX !== null) {
                var rx = Math.min(st.dragStartVX, st.dragCurVX);
                var rw = Math.abs(st.dragStartVX - st.dragCurVX);
                zoomRectEl = e("rect", { x:rx, y:pad.t, width:rw, height:cH,
                    fill:"rgba(255,255,255,0.07)",
                    stroke:"rgba(255,255,255,0.25)", strokeWidth:1 });
            }

            // ── Crosshair ──
            var crosshairEl = null;
            if (tooltip && tooltip.crossVX !== undefined) {
                crosshairEl = e("line", {
                    x1:tooltip.crossVX, y1:pad.t,
                    x2:tooltip.crossVX, y2:pad.t+cH,
                    stroke:"rgba(255,255,255,0.3)", strokeWidth:1 });
            }

            // ── Tooltip overlay (pixel coords relative to SVG element) ──
            var tooltipEl = null;
            if (tooltip) {
                tooltipEl = e(TooltipBox, {
                    x:tooltip.px, y:tooltip.py,
                    items:tooltip.items,
                    cW:tooltip.pw, cH:tooltip.ph
                });
            }

            return e("div", Object.assign({}, emit(), {
                style:{ boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex", flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235", borderRadius:"4px" }
            }),
                // ── Header ──
                e("div", { style:{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"8px 12px 4px",flexShrink:0,height:"36px"}},
                    e("span", {style:{fontSize:"13px",fontWeight:500,color:"#d8d9da"}}, title),
                    e("div", {style:{display:"flex",gap:"6px",alignItems:"center"}},
                        // Time range buttons
                        ["5m","15m","1h","6h","24h","7d"].map(function(r){
                            var active = (timeRange===r) || (timeRange==="auto" && r==="auto");
                            return e("span", { key:r,
                                style:{ fontSize:"11px", cursor:"pointer",
                                    borderRadius:"3px", padding:"1px 6px",
                                    color: timeRange===r ? "#f2cc0c" : "#6c737a",
                                    backgroundColor: timeRange===r ? "rgba(242,204,12,0.12)" : "transparent",
                                    border: "1px solid " + (timeRange===r ? "rgba(242,204,12,0.4)" : "transparent") }
                            }, r);
                        }),
                        st.zoomRange
                            ? e("span", { onClick:function(){ self.setState({zoomRange:null,tooltip:null}); },
                                style:{ fontSize:"11px",color:"#f2cc0c",cursor:"pointer",
                                    backgroundColor:"rgba(242,204,12,0.12)",
                                    borderRadius:"3px",padding:"2px 8px"}}, "\u27F3 Reset zoom")
                            : null,
                        e("span", {style:{fontSize:"18px",color:"#6c737a",cursor:"pointer"}},"\u22EE")
                    )
                ),
                // ── Chart area ──
                e("div", {
                    style:{ flex:1, position:"relative", overflow:"hidden",
                        cursor: st.dragStartVX!==null ? "ew-resize" : "crosshair" },
                    onMouseMove: function(evt) {
                        var svgEl = self._svgEl;
                        if (!svgEl) return;
                        var v = self._toVirtual(svgEl, evt.clientX, evt.clientY);
                        var vx=v.vx, vy=v.vy, pw=v.pw, ph=v.ph;
                        var chartX = vx - pad.l;
                        if (chartX < 0 || chartX > cW || vy < pad.t || vy > pad.t+cH) {
                            self.setState({ tooltip:null });
                            if (st.dragStartVX !== null) self.setState({ dragCurVX:vx });
                            return;
                        }
                        var hoverMs  = minMs + (chartX/cW)*(maxMs-minMs);
                        var items    = [], closestMs = null;
                        series.forEach(function(s,si){
                            if (st.hidden[s.name]) return;
                            var pts = s.points||[];
                            if (!pts.length) return;
                            var best=pts[0], bestD=Math.abs(pts[0].t-hoverMs);
                            for (var i=1;i<pts.length;i++){
                                var d=Math.abs(pts[i].t-hoverMs);
                                if (d<bestD){bestD=d;best=pts[i];}
                            }
                            if (closestMs===null||bestD<Math.abs(closestMs-hoverMs)) closestMs=best.t;
                            items.push({ name:s.name, color:s.color||PALETTE[si%PALETTE.length],
                                value:fmtNum(best.v) });
                        });
                        if (!items.length){ self.setState({tooltip:null}); return; }
                        items[0].header = closestMs!==null ? fmtDateTime(closestMs) : "";
                        var crossVX = closestMs!==null
                            ? pad.l+((closestMs-minMs)/(maxMs-minMs||1))*cW : vx;
                        // Pixel coords for tooltip position
                        var px = ((vx/VW)*pw), py = ((vy/VH)*ph);
                        self.setState({ tooltip:{ px:px, py:py, crossVX:crossVX,
                            items:items, pw:pw, ph:ph } });
                        if (st.dragStartVX!==null) self.setState({ dragCurVX:vx });
                    },
                    onMouseLeave: function(){ self.setState({tooltip:null,dragStartVX:null,dragCurVX:null}); },
                    onMouseDown: function(evt) {
                        if (evt.button!==0) return;
                        var svgEl=self._svgEl; if(!svgEl) return;
                        var v=self._toVirtual(svgEl,evt.clientX,evt.clientY);
                        var chartX=v.vx-pad.l;
                        if (chartX<0||chartX>cW) return;
                        var ms=minMs+(chartX/cW)*(maxMs-minMs);
                        self.setState({ dragStartVX:v.vx, dragCurVX:v.vx, dragStartMs:ms });
                        evt.preventDefault();
                    },
                    onMouseUp: function(evt) {
                        if (st.dragStartVX===null) return;
                        var svgEl=self._svgEl; if(!svgEl) return;
                        var v=self._toVirtual(svgEl,evt.clientX,evt.clientY);
                        var dx=Math.abs(v.vx-st.dragStartVX);
                        if (dx>15) {
                            var ms2=minMs+((v.vx-pad.l)/cW)*(maxMs-minMs);
                            var lo=Math.min(st.dragStartMs,ms2), hi=Math.max(st.dragStartMs,ms2);
                            self.setState({ zoomRange:{minMs:lo,maxMs:hi},
                                dragStartVX:null, dragCurVX:null, dragStartMs:null });
                        } else {
                            self.setState({ dragStartVX:null, dragCurVX:null, dragStartMs:null });
                        }
                    },
                    onDoubleClick: function(){ self.setState({zoomRange:null,tooltip:null}); }
                },
                    e("svg", {
                        ref: function(r){ self._svgEl=r; },
                        viewBox:"0 0 "+VW+" "+VH,
                        preserveAspectRatio:"none",
                        style:{ display:"block", width:"100%", height:"100%" }
                    },
                        // ── Y grid + left axis labels ──
                        lTicks.map(function(v,i){
                            var y=vToYLeft(v);
                            return e("g",{key:"ly"+i},
                                e("line",{x1:pad.l,y1:y,x2:pad.l+cW,y2:y,stroke:"#2c3235",strokeWidth:1}),
                                e("text",{x:pad.l-8,y:y+4,textAnchor:"end",fontSize:"28",fill:"#6c737a"},fmtNum(v))
                            );
                        }),
                        // ── Left Y-axis label ──
                        yLabel ? e("text", { x:18, y:pad.t+cH/2,
                            textAnchor:"middle", fontSize:"24", fill:"#6c737a",
                            transform:"rotate(-90,18,"+(pad.t+cH/2)+")" }, yLabel) : null,
                        // ── Right Y axis labels (dual axis) ──
                        dualY ? rTicks.map(function(v,i){
                            var y=vToYRight(v);
                            return e("g",{key:"ry"+i},
                                dualY&&i===0 ? e("line",{x1:pad.l+cW,y1:pad.t,x2:pad.l+cW,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}) : null,
                                e("text",{x:pad.l+cW+8,y:y+4,textAnchor:"start",fontSize:"28",fill:"#6c737a"},fmtNum(v))
                            );
                        }) : null,
                        // ── Right Y-axis label ──
                        (dualY && y2Label) ? e("text", {
                            x:VW-14, y:pad.t+cH/2,
                            textAnchor:"middle", fontSize:"24", fill:"#6c737a",
                            transform:"rotate(90,"+(VW-14)+","+(pad.t+cH/2)+")" }, y2Label) : null,
                        // ── X grid + time labels ──
                        xTicks.filter(function(t){ return t>=minMs&&t<=maxMs; }).map(function(t,i){
                            var x=msToX(t);
                            return e("g",{key:"xt"+i},
                                e("line",{x1:x,y1:pad.t,x2:x,y2:pad.t+cH,stroke:"#2c3235",strokeWidth:1}),
                                e("text",{x:x,y:pad.t+cH+28,textAnchor:"middle",fontSize:"22",fill:"#6c737a"},fmtTime(t))
                            );
                        }),
                        // ── Threshold lines ──
                        thLines.map(function(th,i){
                            var y=vToYLeft(th.value);
                            return e("g",{key:"th"+i},
                                e("line",{x1:pad.l,y1:y,x2:pad.l+cW,y2:y,
                                    stroke:th.color||"#f2495c",strokeWidth:2,strokeDasharray:"12 6"}),
                                e("text",{x:pad.l+cW+4,y:y+4,fontSize:"22",fill:th.color||"#f2495c"},th.label||"")
                            );
                        }),
                        // ── Axes ──
                        e("line",{x1:pad.l,y1:pad.t,x2:pad.l,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        e("line",{x1:pad.l,y1:pad.t+cH,x2:pad.l+cW,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        // ── Series ──
                        series.map(function(s,si){
                            if (st.hidden[s.name]) return null;
                            var color=s.color||PALETTE[si%PALETTE.length];
                            var path=buildPath(s);
                            var vis=(s.points||[]).filter(function(p){return p.t>=minMs&&p.t<=maxMs;});
                            var fillD=(fillOp>0&&path&&vis.length)
                                ? path+" L"+msToX(vis[vis.length-1].t).toFixed(1)+","+(pad.t+cH).toFixed(1)
                                       +" L"+msToX(vis[0].t).toFixed(1)+","+(pad.t+cH).toFixed(1)+" Z"
                                : null;
                            return e("g",{key:"s"+si},
                                fillD?e("path",{d:fillD,fill:color,fillOpacity:fillOp,stroke:"none"}):null,
                                path ?e("path",{d:path, fill:"none",stroke:color,
                                    strokeWidth:lw*3,strokeLinejoin:"round",strokeLinecap:"round"}):null,
                                showDots?vis.map(function(pt,i){
                                    return e("circle",{key:"d"+i,
                                        cx:msToX(pt.t).toFixed(1),cy:vToY(s,pt.v).toFixed(1),
                                        r:5,fill:color,stroke:"#181b1f",strokeWidth:2});
                                }):null
                            );
                        }).filter(Boolean),
                        crosshairEl,
                        zoomRectEl
                    ),
                    tooltipEl
                ),
                // ── Legend ──
                e("div", {style:{display:"flex",flexWrap:"wrap",gap:"12px",
                    padding:"4px 12px 8px",flexShrink:0,alignItems:"center",height:"32px"}},
                    series.map(function(s,i){
                        var color=s.color||PALETTE[i%PALETTE.length];
                        return e("div",{key:"l"+i,
                            onClick:function(){ self.setState(function(prev){
                                var h=Object.assign({},prev.hidden);
                                h[s.name]=!h[s.name]; return{hidden:h};
                            });},
                            style:{display:"flex",alignItems:"center",gap:"6px",
                                cursor:"pointer",opacity:st.hidden[s.name]?0.3:1,
                                transition:"opacity 0.2s"}},
                            e("span",{style:{display:"inline-block",width:"14px",height:"3px",
                                backgroundColor:color,borderRadius:"2px"}}),
                            e("span",{style:{fontSize:"12px",color:"#9fa7b3",userSelect:"none"}},
                                s.name + (dualY&&s.yAxis===1?" (R)":""))
                        );
                    })
                )
            );
        }
    }
    class TimeSeriesMeta {
        getComponentType() { return "com.example.perspective.timeseries"; }
        getViewComponent() { return TimeSeriesComponent; }
        getDefaultSize()   { return { width:540, height:300 }; }
        getPropsReducer(tree) {
            var now=Date.now();
            return {
                series:          tree.read("series",[{name:"cpu",color:"#73bf69",yAxis:0,points:[
                    {t:now-300000,v:28},{t:now-240000,v:28},{t:now-180000,v:29},
                    {t:now-120000,v:45},{t:now-60000,v:21},{t:now,v:21}]}]),
                title:           tree.readString("title","TimeSeries Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                fillOpacity:     tree.readNumber("fillOpacity",0.07),
                lineWidth:       tree.readNumber("lineWidth",2),
                showDots:        tree.readBoolean("showDots",true),      // FIX: was missing
                smooth:          tree.readBoolean("smooth",false),
                dualYAxis:       tree.readBoolean("dualYAxis",false),
                yAxisLabel:      tree.readString("yAxisLabel",""),
                y2AxisLabel:     tree.readString("y2AxisLabel",""),
                timeRange:       tree.readString("timeRange","auto"),
                thresholdLines:  tree.read("thresholdLines",[])
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  4. LINE CHART  (unchanged logic, minor cleanup)
     * ═══════════════════════════════════════════════════════════════════════════ */

    var LC_PAD = { l:50, r:16, t:10, b:36 };

    class LineChartComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state  = { tooltip:null };
            this._svgEl = null;
        }
        render() {
            var p     = this.props.props, emit=this.props.emit, self=this;
            var series     = p.series     || [{ name:"Series A", color:"#5794f2", data:[10,40,30,60,45,75,55] }];
            var labels     = p.labels     || [];
            var title      = p.title      || "Line Chart";
            var showDots   = p.showDots   !== undefined ? p.showDots   : true;
            var showGrid   = p.showGrid   !== undefined ? p.showGrid   : true;
            var showLegend = p.showLegend !== undefined ? p.showLegend : true;
            var smooth     = !!p.smooth;
            var fillArea   = !!p.fillArea;
            var bgColor    = p.backgroundColor || "#181b1f";

            var tooltip = this.state.tooltip;
            var pad = LC_PAD;
            var lVW=1000, lVH=600;
            var cW=lVW-pad.l-pad.r, cH=lVH-pad.t-pad.b;

            var allVals=[]; series.forEach(function(s){ (s.data||[]).forEach(function(v){ allVals.push(v); }); });
            if (!allVals.length) {
                return e("div", Object.assign({}, emit(), {
                    style:{boxSizing:"border-box",overflow:"hidden",display:"flex",
                        alignItems:"center",justifyContent:"center",
                        backgroundColor:bgColor,color:"#6c737a"}}), "No data");
            }

            var maxPts  = Math.max.apply(null, series.map(function(s){ return (s.data||[]).length; }));
            var dataMin = Math.min.apply(null, allVals);
            var dataMax = Math.max.apply(null, allVals);
            var yTicks  = niceTicks(dataMin,dataMax,5);
            var yMin=yTicks[0], yMax=yTicks[yTicks.length-1];

            function xPos(i){ return pad.l+(maxPts<=1?cW/2:(i/(maxPts-1))*cW); }
            function yPos(v){ return pad.t+cH-((v-yMin)/(yMax-yMin||1))*cH; }

            function buildPath(data){
                if(!data||!data.length) return "";
                if(!smooth) return data.map(function(v,i){
                    return (i===0?"M":"L")+xPos(i).toFixed(1)+","+yPos(v).toFixed(1);
                }).join(" ");
                var d="M"+xPos(0).toFixed(1)+","+yPos(data[0]).toFixed(1);
                for(var i=1;i<data.length;i++){
                    var x0=xPos(i-1),y0=yPos(data[i-1]),x1=xPos(i),y1=yPos(data[i]),cx=(x0+x1)/2;
                    d+=" C"+cx.toFixed(1)+","+y0.toFixed(1)+" "+cx.toFixed(1)+","+y1.toFixed(1)+" "+x1.toFixed(1)+","+y1.toFixed(1);
                }
                return d;
            }

            return e("div", Object.assign({}, emit(), {
                style:{boxSizing:"border-box",overflow:"hidden",backgroundColor:bgColor,
                    display:"flex",flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235",borderRadius:"4px"}
            }),
                e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"8px 12px 4px",height:"36px",flexShrink:0}},
                    e("span",{style:{fontSize:"13px",fontWeight:500,color:"#d8d9da"}},title),
                    e("span",{style:{fontSize:"18px",color:"#6c737a",cursor:"pointer"}},"\u22EE")
                ),
                e("div",{
                    style:{flex:1,position:"relative",overflow:"hidden"},
                    onMouseMove:function(evt){
                        var svgEl=self._svgEl; if(!svgEl) return;
                        var r=svgEl.getBoundingClientRect();
                        var px=evt.clientX-r.left, py=evt.clientY-r.top;
                        var vx=(px/r.width)*lVW;
                        var chartX=vx-pad.l;
                        if(chartX<0||chartX>cW){self.setState({tooltip:null});return;}
                        var idx=clamp(Math.round((chartX/cW)*(maxPts-1)),0,maxPts-1);
                        var items=series.map(function(s,si){
                            var v=(s.data||[])[idx];
                            return{name:s.name,color:s.color||PALETTE[si%PALETTE.length],
                                value:v!==undefined?fmtNum(v):""};
                        }).filter(function(it){return it.value!=="";});
                        if(labels[idx]) items.unshift({header:labels[idx]});
                        self.setState({tooltip:{px:px,py:py,items:items,cW:r.width,cH:r.height}});
                    },
                    onMouseLeave:function(){self.setState({tooltip:null});}
                },
                    e("svg",{
                        ref:function(r){self._svgEl=r;},
                        viewBox:"0 0 "+lVW+" "+lVH,
                        preserveAspectRatio:"none",
                        style:{display:"block",width:"100%",height:"100%"}
                    },
                        showGrid?yTicks.map(function(v,i){
                            var y=yPos(v);
                            return e("g",{key:"gy"+i},
                                e("line",{x1:pad.l,y1:y,x2:pad.l+cW,y2:y,stroke:"#2c3235",strokeWidth:1}),
                                e("text",{x:pad.l-6,y:y+4,textAnchor:"end",fontSize:"28",fill:"#6c737a"},fmtNum(v))
                            );
                        }):null,
                        labels.map(function(lbl,i){
                            var step=Math.max(1,Math.floor(maxPts/7));
                            if(i%step!==0&&i!==maxPts-1) return null;
                            return e("text",{key:"xl"+i,x:xPos(i),y:pad.t+cH+28,
                                textAnchor:"middle",fontSize:"24",fill:"#6c737a"},lbl);
                        }).filter(Boolean),
                        e("line",{x1:pad.l,y1:pad.t,x2:pad.l,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        e("line",{x1:pad.l,y1:pad.t+cH,x2:pad.l+cW,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        series.map(function(s,si){
                            var color=s.color||PALETTE[si%PALETTE.length];
                            var path=buildPath(s.data||[]);
                            var fillD=(fillArea&&path&&(s.data||[]).length)
                                ?path+" L"+xPos((s.data||[]).length-1).toFixed(1)+","+(pad.t+cH).toFixed(1)
                                       +" L"+pad.l.toFixed(1)+","+(pad.t+cH).toFixed(1)+" Z":null;
                            return e("g",{key:"s"+si},
                                fillD?e("path",{d:fillD,fill:color,fillOpacity:0.1,stroke:"none"}):null,
                                path ?e("path",{d:path, fill:"none",stroke:color,
                                    strokeWidth:5,strokeLinejoin:"round",strokeLinecap:"round"}):null,
                                showDots?(s.data||[]).map(function(v,i){
                                    return e("circle",{key:"d"+i,cx:xPos(i).toFixed(1),cy:yPos(v).toFixed(1),
                                        r:6,fill:color,stroke:"#181b1f",strokeWidth:2});
                                }):null
                            );
                        })
                    ),
                    tooltip?e(TooltipBox,{x:tooltip.px,y:tooltip.py,items:tooltip.items,
                        cW:tooltip.cW,cH:tooltip.cH}):null
                ),
                showLegend?e("div",{style:{display:"flex",flexWrap:"wrap",gap:"12px",
                    padding:"2px 12px 6px",height:"28px",flexShrink:0,alignItems:"center"}},
                    series.map(function(s,i){
                        var color=s.color||PALETTE[i%PALETTE.length];
                        return e("div",{key:"l"+i,style:{display:"flex",alignItems:"center",gap:"6px"}},
                            e("span",{style:{display:"inline-block",width:"14px",height:"3px",
                                backgroundColor:color,borderRadius:"2px"}}),
                            e("span",{style:{fontSize:"12px",color:"#9fa7b3"}},s.name)
                        );
                    })
                ):null
            );
        }
    }
    class LineChartMeta {
        getComponentType() { return "com.example.perspective.linechart"; }
        getViewComponent() { return LineChartComponent; }
        getDefaultSize()   { return { width:500, height:300 }; }
        getPropsReducer(tree) {
            return {
                series:          tree.read("series",[{name:"Series A",color:"#5794f2",data:[10,40,30,60,45,75,55]}]),
                labels:          tree.read("labels",["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]),
                title:           tree.readString("title","Line Chart"),
                showDots:        tree.readBoolean("showDots",true),
                showGrid:        tree.readBoolean("showGrid",true),
                showLegend:      tree.readBoolean("showLegend",true),
                smooth:          tree.readBoolean("smooth",false),
                fillArea:        tree.readBoolean("fillArea",false),
                backgroundColor: tree.readString("backgroundColor","#181b1f")
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  5. BAR CHART PANEL  (+ horizontal orientation + stacked mode)
     * ═══════════════════════════════════════════════════════════════════════════ */

    var BC_PAD = { l:44, r:20, t:10, b:36 };
    var BC_H_PAD = { l:90, r:20, t:10, b:20 }; // horizontal: wider left for labels

    class BarChartComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state  = { tooltip:null, hidden:{}, hoverBar:null };
            this._svgEl = null;
        }

        render() {
            var p      = this.props.props, emit=this.props.emit, self=this;
            var series   = p.series || [{name:"Series A",color:"#73bf69",
                data:[{label:"Jan",v:30},{label:"Feb",v:45},{label:"Mar",v:28},
                      {label:"Apr",v:55},{label:"May",v:40}]}];
            var title    = p.title           || "Bar Chart Panel";
            var bgColor  = p.backgroundColor || "#181b1f";
            var barR     = p.barRadius        !== undefined ? p.barRadius : 3;
            var showVals = !!p.showValues;
            var horiz    = p.orientation      === "horizontal";
            var stacked  = !!p.stacked;

            var st      = this.state;
            var lVW=1000, lVH=600;
            var pad     = horiz ? BC_H_PAD : BC_PAD;
            var cW      = lVW - pad.l - pad.r;
            var cH      = lVH - pad.t - pad.b;

            var visSeries = series.filter(function(s){ return !st.hidden[s.name]; });

            // Collect all category labels (from first series)
            var baseData = (series[0]&&series[0].data)||[];
            var cats = baseData.map(function(d){ return typeof d==="object"?(d.label||""):String(d); });
            var maxCats = cats.length || 1;

            // Calculate bar heights / positions
            var allBars = [];
            if (stacked) {
                // Stacked: bars pile on top of each other per category
                var stackTotals = cats.map(function(){ return 0; });
                var axisMax = 0;
                visSeries.forEach(function(s){
                    (s.data||[]).forEach(function(d,di){
                        var v=typeof d==="object"?d.v:d;
                        stackTotals[di]=(stackTotals[di]||0)+v;
                    });
                });
                axisMax = Math.max.apply(null, stackTotals)||1;
                var yTks = niceTicks(0,axisMax,5);
                var axisMx = yTks[yTks.length-1]||axisMax;

                var stackOffsets = cats.map(function(){ return 0; });
                visSeries.forEach(function(s,si){
                    var color=s.color||PALETTE[si%PALETTE.length];
                    (s.data||[]).forEach(function(d,di){
                        var v=typeof d==="object"?d.v:d;
                        var lbl=cats[di];
                        if (horiz) {
                            var barH=cH/maxCats*0.65;
                            var by=pad.t+(di/maxCats)*cH+(cH/maxCats*0.175);
                            var bxOff=(stackOffsets[di]/axisMx)*cW;
                            var bw=(v/axisMx)*cW;
                            allBars.push({id:si+"-"+di,y:by,h:barH,x:pad.l+bxOff,w:bw,
                                v:v,label:lbl,seriesName:s.name,color:color,horiz:true});
                            stackOffsets[di]+=v;
                        } else {
                            var bw2=cW/maxCats*0.65;
                            var bx=pad.l+(di/maxCats)*cW+(cW/maxCats*0.175);
                            var bH2=(v/axisMx)*cH;
                            var by2=pad.t+cH-((stackOffsets[di]+v)/axisMx)*cH;
                            allBars.push({id:si+"-"+di,x:bx,w:bw2,y:by2,h:bH2,
                                v:v,label:lbl,seriesName:s.name,color:color,horiz:false});
                            stackOffsets[di]+=v;
                        }
                    });
                });

                var allVals=[]; visSeries.forEach(function(s){
                    (s.data||[]).forEach(function(d){allVals.push(typeof d==="object"?d.v:d);});
                });

                // Build axis ticks separately
                var yTicksEl = yTks.map(function(v,i){
                    if (horiz) {
                        var x=pad.l+(v/axisMx)*cW;
                        return e("g",{key:"gy"+i},
                            e("line",{x1:x,y1:pad.t,x2:x,y2:pad.t+cH,stroke:"#2c3235",strokeWidth:1}),
                            e("text",{x:x,y:pad.t+cH+24,textAnchor:"middle",fontSize:"24",fill:"#6c737a"},fmtNum(v))
                        );
                    }
                    var y=pad.t+cH-(v/axisMx)*cH;
                    return e("g",{key:"gy"+i},
                        e("line",{x1:pad.l,y1:y,x2:pad.l+cW,y2:y,stroke:"#2c3235",strokeWidth:1}),
                        e("text",{x:pad.l-5,y:y+4,textAnchor:"end",fontSize:"28",fill:"#6c737a"},fmtNum(v))
                    );
                });
                var renderData = { yTicksEl:yTicksEl, axisMx:axisMx };
                return self._renderChart(emit,title,bgColor,barR,showVals,horiz,stacked,
                    lVW,lVH,pad,cW,cH,cats,allBars,renderData,series,st);

            } else {
                // Grouped
                var allVals2=[];
                visSeries.forEach(function(s){
                    (s.data||[]).forEach(function(d){allVals2.push(typeof d==="object"?d.v:d);});
                });
                var dataMax2=allVals2.length?Math.max.apply(null,allVals2):1;
                var yTks2=niceTicks(0,dataMax2,5);
                var axisMx2=yTks2[yTks2.length-1]||dataMax2||1;
                var bCount=visSeries.length||1;

                visSeries.forEach(function(s,si){
                    var color=s.color||PALETTE[si%PALETTE.length];
                    (s.data||[]).forEach(function(d,di){
                        var v=typeof d==="object"?d.v:d;
                        var lbl=cats[di]||String(di);
                        if (horiz) {
                            var slotH=(cH/maxCats)*0.8;
                            var innerH=slotH/bCount;
                            var by=pad.t+(di/maxCats)*cH+(cH/maxCats*0.1)+(si*innerH);
                            var bw=(v/axisMx2)*cW;
                            allBars.push({id:si+"-"+di,y:by,h:innerH-3,x:pad.l,w:bw,
                                v:v,label:lbl,seriesName:s.name,color:color,horiz:true});
                        } else {
                            var slotW=(cW/maxCats)*0.8;
                            var innerW=slotW/bCount;
                            var bx=pad.l+(di/maxCats)*cW+(cW/maxCats*0.1)+(si*innerW);
                            var bH=(v/axisMx2)*cH;
                            var by2=pad.t+cH-bH;
                            allBars.push({id:si+"-"+di,x:bx,w:innerW-3,y:by2,h:bH,
                                v:v,label:lbl,seriesName:s.name,color:color,horiz:false});
                        }
                    });
                });

                var yTicksEl2 = yTks2.map(function(v,i){
                    if (horiz){
                        var x=pad.l+(v/axisMx2)*cW;
                        return e("g",{key:"gy"+i},
                            e("line",{x1:x,y1:pad.t,x2:x,y2:pad.t+cH,stroke:"#2c3235",strokeWidth:1}),
                            e("text",{x:x,y:pad.t+cH+24,textAnchor:"middle",fontSize:"24",fill:"#6c737a"},fmtNum(v))
                        );
                    }
                    var y=pad.t+cH-(v/axisMx2)*cH;
                    return e("g",{key:"gy"+i},
                        e("line",{x1:pad.l,y1:y,x2:pad.l+cW,y2:y,stroke:"#2c3235",strokeWidth:1}),
                        e("text",{x:pad.l-5,y:y+4,textAnchor:"end",fontSize:"28",fill:"#6c737a"},fmtNum(v))
                    );
                });
                return self._renderChart(emit,title,bgColor,barR,showVals,horiz,stacked,
                    lVW,lVH,pad,cW,cH,cats,allBars,{yTicksEl:yTicksEl2,axisMx:axisMx2},series,st);
            }
        }

        _renderChart(emit,title,bgColor,barR,showVals,horiz,stacked,
                     lVW,lVH,pad,cW,cH,cats,allBars,renderData,series,st) {
            var self = this;
            var yTicksEl = renderData.yTicksEl;

            return e("div", Object.assign({}, emit(), {
                style:{boxSizing:"border-box",overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex",flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235",borderRadius:"4px"}
            }),
                e("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"8px 12px 4px",height:"36px",flexShrink:0}},
                    e("span",{style:{fontSize:"13px",fontWeight:500,color:"#d8d9da"}},title),
                    e("span",{style:{fontSize:"18px",color:"#6c737a",cursor:"pointer"}},"\u22EE")
                ),
                e("div",{
                    style:{flex:1,position:"relative",overflow:"hidden"},
                    onMouseMove:function(evt){
                        var svgEl=self._svgEl; if(!svgEl) return;
                        var r=svgEl.getBoundingClientRect();
                        var px=evt.clientX-r.left, py=evt.clientY-r.top;
                        var vx=(px/r.width)*lVW, vy=(py/r.height)*lVH;
                        var found=null;
                        for(var i=0;i<allBars.length;i++){
                            var bar=allBars[i];
                            if(horiz){
                                if(vx>=bar.x&&vx<=bar.x+bar.w&&vy>=bar.y&&vy<=bar.y+bar.h){found=bar;break;}
                            } else {
                                if(vx>=bar.x&&vx<=bar.x+bar.w&&vy>=bar.y&&vy<=bar.y+bar.h){found=bar;break;}
                            }
                        }
                        if(found){
                            var items=[{header:found.label},
                                {name:found.seriesName,color:found.color,value:String(found.v)}];
                            if(found.extraProps) found.extraProps.forEach(function(ep){
                                items.push({name:ep.name,color:"",value:ep.value});
                            });
                            self.setState({tooltip:{px:px,py:py,items:items,cW:r.width,cH:r.height},
                                hoverBar:found.id});
                        } else {
                            self.setState({tooltip:null,hoverBar:null});
                        }
                    },
                    onMouseLeave:function(){self.setState({tooltip:null,hoverBar:null});}
                },
                    e("svg",{
                        ref:function(r){self._svgEl=r;},
                        viewBox:"0 0 "+lVW+" "+lVH,
                        preserveAspectRatio:"none",
                        style:{display:"block",width:"100%",height:"100%"}
                    },
                        yTicksEl,
                        e("line",{x1:pad.l,y1:pad.t,x2:pad.l,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        e("line",{x1:pad.l,y1:pad.t+cH,x2:pad.l+cW,y2:pad.t+cH,stroke:"#4a5568",strokeWidth:1}),
                        // Category labels
                        horiz
                            ? cats.map(function(lbl,di){
                                var cy2=pad.t+(di/cats.length)*cH+(cH/cats.length/2);
                                return e("text",{key:"cl"+di,x:pad.l-8,y:cy2+4,
                                    textAnchor:"end",fontSize:"22",fill:"#6c737a"},lbl);
                            })
                            : cats.map(function(lbl,di){
                                var cx2=pad.l+(di/cats.length)*cW+(cW/cats.length/2);
                                return e("text",{key:"cl"+di,x:cx2,y:pad.t+cH+24,
                                    textAnchor:"middle",fontSize:"22",fill:"#6c737a"},lbl);
                            }),
                        // Bars
                        allBars.map(function(bar){
                            var r2=Math.min(barR*5,Math.min(bar.w,bar.h)/2);
                            return e("g",{key:"b"+bar.id},
                                e("rect",{x:bar.x,y:bar.y,width:Math.max(0,bar.w),height:Math.max(0,bar.h),
                                    fill:bar.color,fillOpacity:st.hoverBar===bar.id?1:0.8,rx:r2,ry:r2}),
                                (showVals&&(horiz?bar.w>30:bar.h>20))
                                    ?e("text",{
                                        x:horiz?(bar.x+bar.w+6):(bar.x+bar.w/2),
                                        y:horiz?(bar.y+bar.h/2+4):(bar.y-6),
                                        textAnchor:horiz?"start":"middle",
                                        fontSize:"22",fill:"#d8d9da"},String(bar.v))
                                    :null
                            );
                        })
                    ),
                    st.tooltip?e(TooltipBox,{x:st.tooltip.px,y:st.tooltip.py,items:st.tooltip.items,
                        cW:st.tooltip.cW,cH:st.tooltip.cH}):null
                ),
                e("div",{style:{display:"flex",flexWrap:"wrap",gap:"12px",
                    padding:"4px 12px 6px",height:"32px",flexShrink:0,alignItems:"center"}},
                    series.map(function(s,i){
                        var color=s.color||PALETTE[i%PALETTE.length];
                        return e("div",{key:"l"+i,
                            onClick:function(){ self.setState(function(prev){
                                var h=Object.assign({},prev.hidden);
                                h[s.name]=!h[s.name]; return{hidden:h};
                            });},
                            style:{display:"flex",alignItems:"center",gap:"6px",
                                cursor:"pointer",opacity:st.hidden[s.name]?0.3:1,
                                transition:"opacity 0.2s"}},
                            e("span",{style:{display:"inline-block",width:"14px",height:"10px",
                                backgroundColor:color,borderRadius:"2px"}}),
                            e("span",{style:{fontSize:"12px",color:"#9fa7b3",userSelect:"none"}},s.name)
                        );
                    })
                )
            );
        }
    }
    class BarChartMeta {
        getComponentType() { return "com.example.perspective.barchart"; }
        getViewComponent() { return BarChartComponent; }
        getDefaultSize()   { return { width:500, height:300 }; }
        getPropsReducer(tree) {
            return {
                series:          tree.read("series",[{name:"Series A",color:"#73bf69",
                    data:[{label:"Jan",v:30},{label:"Feb",v:45},{label:"Mar",v:28},
                          {label:"Apr",v:55},{label:"May",v:40}]}]),
                title:           tree.readString("title","Bar Chart Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                barRadius:       tree.readNumber("barRadius",3),
                showValues:      tree.readBoolean("showValues",false),
                orientation:     tree.readString("orientation","vertical"),
                stacked:         tree.readBoolean("stacked",false)
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  6. STAT CARD  (+ sparkline, dark-mode default)
     * ═══════════════════════════════════════════════════════════════════════════ */

    var ICON_PATHS = {
        bolt:  "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
        temp:  "M12 2a3 3 0 0 0-3 3v8.27A6 6 0 1 0 15 13.27V5a3 3 0 0 0-3-3z",
        power: "M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10",
        alarm: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
        check: "M20 6L9 17l-5-5"
    };
    var TREND_PATHS = {
        up:   "M12 19V5m0 0l-7 7m7-7 7 7",
        down: "M12 5v14m0 0l-7-7m7 7 7-7",
        flat: "M5 12h14"
    };

    function sparklinePath(data, W, H) {
        if (!data || data.length < 2) return "";
        var mn=Math.min.apply(null,data), mx=Math.max.apply(null,data);
        var range=mx-mn||1;
        return data.map(function(v,i){
            var x=(i/(data.length-1))*W;
            var y=H-((v-mn)/range)*(H*0.85);
            return (i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1);
        }).join(" ");
    }

    class StatCardComponent extends Cmp {
        render() {
            var p      = this.props.props, emit=this.props.emit;
            // FIX: default backgroundColor = #181b1f (dark), valueColor = #d8d9da
            var value    = p.value      !== undefined ? p.value      : 0;
            var label    = p.label      !== undefined ? p.label      : "Total Value";
            var unit     = p.unit       || "";
            var dec      = p.decimalPlaces !== undefined ? p.decimalPlaces : 1;
            var trend    = p.trend      || "none";
            var trendVal = p.trendValue || "";
            var icon     = p.icon       || "none";
            var accent   = p.accentColor    || "#3b82f6";
            var bgColor  = p.backgroundColor|| "#181b1f";   // FIX: dark default
            var valColor = p.valueColor     || "#d8d9da";    // FIX: dark text default
            var lblColor = p.labelColor     || "#9fa7b3";
            var showBorder=p.showBorder !== undefined ? p.showBorder : true;
            var sparkData = p.sparkline  || [];
            var sparkColor= p.sparklineColor || "#3b82f6";

            var trendColor=trend==="up"?"#73bf69":trend==="down"?"#f2495c":"#9fa7b3";

            // Sparkline SVG (100% width, 48px height)
            var sparkEl = null;
            if (sparkData.length >= 2) {
                var spPath = sparklinePath(sparkData, 200, 40);
                var mn=Math.min.apply(null,sparkData),mx=Math.max.apply(null,sparkData);
                var rng=mx-mn||1;
                var fillPts = sparkData.map(function(v,i){
                    var x=(i/(sparkData.length-1))*200;
                    var y=40-((v-mn)/rng)*(40*0.85);
                    return x.toFixed(1)+","+y.toFixed(1);
                });
                var fillPath="M0,40 L"+fillPts.join(" L")+" L200,40 Z";

                sparkEl = e("div",{style:{
                    position:"absolute",bottom:0,left:0,right:0,height:"50px",
                    overflow:"hidden",pointerEvents:"none"
                }},
                    e("svg",{viewBox:"0 0 200 40",preserveAspectRatio:"none",
                        style:{width:"100%",height:"100%",display:"block"}},
                        e("path",{d:fillPath,fill:sparkColor,fillOpacity:0.12,stroke:"none"}),
                        e("path",{d:spPath,fill:"none",stroke:sparkColor,
                            strokeWidth:1.5,strokeLinejoin:"round",strokeLinecap:"round"})
                    )
                );
            }

            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor, borderRadius:"4px",
                    border: showBorder ? "1px solid #2c3235" : "none",
                    padding:"16px",
                    display:"flex", flexDirection:"column",
                    justifyContent:"space-between",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    position:"relative"    // for sparkline absolute positioning
                }
            }),
                e("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",zIndex:1}},
                    e("span",{style:{fontSize:"13px",color:lblColor,fontWeight:500,lineHeight:"1.3"}},label),
                    (icon!=="none"&&ICON_PATHS[icon])
                        ?e("div",{style:{width:"32px",height:"32px",borderRadius:"6px",
                            backgroundColor:hexAlpha(accent,0.15),
                            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
                            e("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",
                                stroke:accent,strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round"},
                                e("path",{d:ICON_PATHS[icon]})))
                        :null
                ),
                e("div",{style:{display:"flex",alignItems:"baseline",gap:"4px",marginTop:"8px",zIndex:1}},
                    e("span",{style:{fontSize:"28px",fontWeight:"700",color:valColor,lineHeight:"1"}},
                        Number(value).toFixed(dec)),
                    unit?e("span",{style:{fontSize:"14px",color:lblColor,marginBottom:"2px"}},unit):null
                ),
                (trend!=="none")
                    ?e("div",{style:{display:"flex",alignItems:"center",gap:"4px",marginTop:"6px",zIndex:1}},
                        e("svg",{width:"13",height:"13",viewBox:"0 0 24 24",fill:"none",
                            stroke:trendColor,strokeWidth:"2.5",strokeLinecap:"round",strokeLinejoin:"round"},
                            e("path",{d:TREND_PATHS[trend]||""})),
                        trendVal?e("span",{style:{fontSize:"12px",color:trendColor,fontWeight:"600"}},trendVal):null
                    ):null,
                sparkEl
            );
        }
    }
    class StatCardMeta {
        getComponentType() { return "com.example.perspective.statcard"; }
        getViewComponent() { return StatCardComponent; }
        getDefaultSize()   { return { width:200, height:130 }; }
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
                backgroundColor: tree.readString("backgroundColor","#181b1f"),  // FIX
                valueColor:      tree.readString("valueColor","#d8d9da"),        // FIX
                labelColor:      tree.readString("labelColor","#9fa7b3"),
                showBorder:      tree.readBoolean("showBorder",true),
                sparkline:       tree.read("sparkline",[]),
                sparklineColor:  tree.readString("sparklineColor","#3b82f6")
            };
        }
    }

    /* ═══════════════════════════════════════════════════════════════════════════
     *  REGISTER ALL
     * ═══════════════════════════════════════════════════════════════════════════ */
    CR.register(new StatusIndicatorMeta());
    CR.register(new GaugeMeta());
    CR.register(new TimeSeriesMeta());
    CR.register(new LineChartMeta());
    CR.register(new BarChartMeta());
    CR.register(new StatCardMeta());

    console.log("[CustomComponents v5] 6 components registered.",
        "Fixes: zoomRect vcoords, showDots, gauge angles, statcard dark bg.",
        "New: dual Y-axis, Y-axis label, time-range picker, needle, horizontal/stacked bar, sparkline.");

})();
