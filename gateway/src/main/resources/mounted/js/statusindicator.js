/**
 * Custom Perspective Components  v4.0
 *
 * ══════════════════════════════════════════════════════════════
 * PERSPECTIVE SIZING CONTRACT (v4):
 *
 *  Perspective injects  position/width/height/top/left  via the
 *  "emit()" call.  The returned object MUST be spread onto the
 *  outermost DOM element that you return from render().
 *
 *  Critical rule: DO NOT add your own  width / height  on the
 *  same element.  Perspective's injected style already contains
 *  those values.  Overriding them (even with "100%") breaks the
 *  resize handle.
 *
 *  Correct pattern:
 *    const rootStyle = { boxSizing:"border-box", overflow:"hidden", ... };
 *    return e("div", Object.assign({}, emit(), { style: rootStyle }), children)
 *    // DO NOT include width/height in rootStyle
 *
 *  For SVG-based charts:
 *    - Root <div> gets emit() (no width/height in extra style)
 *    - Inner wrapper <div> uses  style="position:absolute;inset:0"
 *      so it fills whatever size Perspective assigned.
 *    - SVG uses width="100%" height="100%".
 *    - All coordinate math is done via  getBoundingClientRect()
 *      on the SVG element (not the root div), called inside event
 *      handlers (always up-to-date after layout).
 * ══════════════════════════════════════════════════════════════
 *
 * Components registered:
 *   com.example.perspective.statusindicator  – LED status indicator
 *   com.example.perspective.gauge           – Circular arc gauge
 *   com.example.perspective.timeseries      – Grafana-style time-series
 *   com.example.perspective.linechart       – Static line chart
 *   com.example.perspective.barchart        – Bar chart with tooltip
 *   com.example.perspective.statcard        – KPI stat card
 */

(function () {
    "use strict";

    var CR  = window.PerspectiveClient.ComponentRegistry;
    var Cmp = window.PerspectiveClient.Component;
    var e   = React.createElement;

    // ──────────────────────────────────────────────────────────────────
    // UTILITIES
    // ──────────────────────────────────────────────────────────────────

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function niceNum(range, round) {
        if (!range || range === 0) return 1;
        var exp = Math.floor(Math.log10(Math.abs(range)));
        var f   = range / Math.pow(10, exp);
        var nf;
        if (round) { nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; }
        else        { nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; }
        return nf * Math.pow(10, exp);
    }

    function niceTicks(lo, hi, count) {
        count = count || 5;
        if (lo === hi) { lo -= 1; hi += 1; }
        var step  = niceNum((hi - lo) / (count - 1), true);
        var start = Math.floor(lo / step) * step;
        var ticks = [];
        for (var v = start; v <= hi + step * 0.5; v = Math.round((v + step) * 1e9) / 1e9) {
            ticks.push(v);
        }
        return ticks;
    }

    function fmtNum(v) {
        if (v === undefined || v === null || isNaN(v)) return "";
        var n = Number(v);
        if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
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

    // ──────────────────────────────────────────────────────────────────
    // TOOLTIP  (positioned relative to SVG container div)
    // ──────────────────────────────────────────────────────────────────

    function TooltipBox(props) {
        var x = props.x, y = props.y, items = props.items, cW = props.cW, cH = props.cH;
        var TW = 190;
        var TH = 22 + items.length * 22 + 10;
        var left = x + 16;
        var top  = y - TH / 2;
        if (left + TW > cW - 4) left = x - TW - 16;
        if (top < 4)            top  = 4;
        if (top + TH > cH - 4) top  = cH - TH - 4;

        return e("div", {
            style: {
                position:"absolute", left: left + "px", top: top + "px",
                backgroundColor:"#1f2329", border:"1px solid #34383e",
                borderRadius:"4px", padding:"8px 10px",
                pointerEvents:"none", zIndex:9999,
                minWidth:"160px", boxShadow:"0 4px 16px rgba(0,0,0,0.6)"
            }
        },
            items[0] && items[0].header
                ? e("div", {
                    style:{ color:"#d8d9da", fontSize:"12px", fontWeight:"600",
                        marginBottom:"6px", borderBottom:"1px solid #34383e", paddingBottom:"4px" }
                  }, items[0].header)
                : null,
            items.filter(function(it){ return it.name !== undefined; }).map(function(it, i) {
                return e("div", {
                    key: i,
                    style:{ display:"flex", alignItems:"center",
                            justifyContent:"space-between", gap:"8px", marginTop:"3px" }
                },
                    e("div", { style:{ display:"flex", alignItems:"center", gap:"6px" } },
                        it.color
                            ? e("span", { style:{ display:"inline-block", width:"10px", height:"3px",
                                backgroundColor:it.color, borderRadius:"2px", flexShrink:0 }})
                            : null,
                        e("span", { style:{ color:"#9fa7b3", fontSize:"11px" } }, it.name)
                    ),
                    e("span", { style:{ color:"#d8d9da", fontSize:"12px", fontWeight:"600" } }, it.value)
                );
            })
        );
    }

    // ══════════════════════════════════════════════════════════════════
    //  1.  STATUS INDICATOR
    // ══════════════════════════════════════════════════════════════════

    var STATUS_COLORS = { ok:"#73bf69", warn:"#f2cc0c", error:"#f2495c", off:"#9ca3af" };

    function StyleTag() {
        return e("style", { key:"si-style" },
            "@keyframes si-blink{0%,100%{opacity:1}50%{opacity:0.15}}"
        );
    }

    class StatusIndicatorComponent extends Cmp {
        render() {
            var p      = this.props.props;
            var emit   = this.props.emit;
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

            // emit() injected Perspective size — do NOT add width/height here
            return e("div", Object.assign({}, emit(), {
                style: {
                    display:"flex",
                    flexDirection: isH ? "row" : "column",
                    alignItems:"center", justifyContent:"center",
                    gap: gap + "px", overflow:"hidden",
                    boxSizing:"border-box"
                }
            }),
                StyleTag(),
                (lpos === "top" || lpos === "left") ? [
                    e("span", { key:"l", style:{ fontSize:fs+"px", color:fc, userSelect:"none", whiteSpace:"nowrap" }}, label),
                    e("span", { key:"led", style:{
                        display:"inline-block", width:size+"px", height:size+"px",
                        borderRadius:"50%", backgroundColor:color, flexShrink:0,
                        boxShadow: glow ? "0 0 "+(size*1.2)+"px "+(size*0.6)+"px "+hexAlpha(color,0.55) : "none",
                        animation: blink ? "si-blink "+(1/bspd).toFixed(2)+"s ease-in-out infinite" : "none"
                    }})
                ] : [
                    e("span", { key:"led", style:{
                        display:"inline-block", width:size+"px", height:size+"px",
                        borderRadius:"50%", backgroundColor:color, flexShrink:0,
                        boxShadow: glow ? "0 0 "+(size*1.2)+"px "+(size*0.6)+"px "+hexAlpha(color,0.55) : "none",
                        animation: blink ? "si-blink "+(1/bspd).toFixed(2)+"s ease-in-out infinite" : "none"
                    }}),
                    (lpos !== "none" && label !== "")
                        ? e("span", { key:"l", style:{ fontSize:fs+"px", color:fc, userSelect:"none", whiteSpace:"nowrap" }}, label)
                        : null
                ]
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

    // ══════════════════════════════════════════════════════════════════
    //  2.  GAUGE
    // ══════════════════════════════════════════════════════════════════

    function polarXY(cx, cy, r, deg) {
        var rad = (deg - 90) * Math.PI / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function arcPath(cx, cy, r, a1, a2) {
        var s    = polarXY(cx, cy, r, a1);
        var en   = polarXY(cx, cy, r, a2);
        var diff = ((a2 - a1) % 360 + 360) % 360;
        return "M"+s.x+" "+s.y+" A"+r+" "+r+" 0 "+(diff > 180 ? 1 : 0)+" 1 "+en.x+" "+en.y;
    }

    function threshColor(v, thr) {
        if (!thr || !thr.length) return "#73bf69";
        var s = thr.slice().sort(function(a,b){ return a.value - b.value; });
        var c = s[0].color;
        for (var i = 0; i < s.length; i++) { if (v >= s[i].value) c = s[i].color; }
        return c;
    }

    class GaugeComponent extends Cmp {
        render() {
            var p      = this.props.props;
            var emit   = this.props.emit;
            var value  = p.value  !== undefined ? p.value  : 0;
            var min    = p.min    !== undefined ? p.min    : 0;
            var max    = p.max    !== undefined ? p.max    : 100;
            var unit   = p.unit   !== undefined ? p.unit   : "%";
            var title  = p.title  !== undefined ? p.title  : "Gauge";
            var thr    = p.thresholds || [{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}];
            var showV  = p.showValue      !== undefined ? p.showValue      : true;
            var dec    = p.decimalPlaces  !== undefined ? p.decimalPlaces  : 1;
            var arcW   = p.arcWidth       !== undefined ? p.arcWidth       : 18;
            var sa     = p.startAngle     !== undefined ? p.startAngle     : -120;
            var ea     = p.endAngle       !== undefined ? p.endAngle       : 120;

            var pct    = clamp((value - min) / (max - min || 1), 0, 1);
            var va     = sa + (ea - sa) * pct;
            var color  = threshColor(value, thr);
            var sorted = thr.slice().sort(function(a,b){ return a.value - b.value; });

            var pMin = polarXY(50, 55, 24, sa);
            var pMax = polarXY(50, 55, 24, ea);

            // emit() injects width/height — only set non-dimensional styles here
            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:"#181b1f",
                    display:"flex", flexDirection:"column",
                    alignItems:"center", justifyContent:"center"
                }
            }),
                title ? e("div", { style:{
                    fontSize:"13px", fontWeight:500, color:"#d8d9da",
                    alignSelf:"flex-start", padding:"8px 12px 0"
                }}, title) : null,
                e("svg", {
                    viewBox:"0 0 100 80",
                    style:{ width:"100%", flex:1, overflow:"visible", maxWidth:"300px", maxHeight:"240px" }
                },
                    // track arc
                    e("path", { d:arcPath(50,55,34,sa,ea), fill:"none",
                        stroke:"#2c3235", strokeWidth:arcW, strokeLinecap:"round" }),
                    // zone arcs
                    sorted.map(function(t, i) {
                        var zMin = t.value;
                        var zMax = sorted[i+1] ? sorted[i+1].value : max;
                        var zA1  = sa + (ea-sa) * clamp((zMin-min)/(max-min||1), 0, 1);
                        var zA2  = sa + (ea-sa) * clamp((zMax-min)/(max-min||1), 0, 1);
                        if (zA2 <= zA1) return null;
                        return e("path", { key:"z"+i, d:arcPath(50,55,34,zA1,zA2),
                            fill:"none", stroke:t.color, strokeWidth:arcW,
                            strokeLinecap:"butt", opacity:0.3 });
                    }),
                    // value arc
                    pct > 0 ? e("path", {
                        d: arcPath(50, 55, 34, sa, va), fill:"none",
                        stroke:color, strokeWidth:arcW, strokeLinecap:"round",
                        style:{ filter:"drop-shadow(0 0 3px "+hexAlpha(color,0.8)+")" }
                    }) : null,
                    // center value text
                    showV ? e("text", {
                        x:50, y:55, textAnchor:"middle", dominantBaseline:"middle",
                        fontSize:"18", fontWeight:"700", fill:color
                    }, Number(value).toFixed(dec) + unit) : null,
                    // min label
                    e("text", { x:pMin.x, y:pMin.y+6, textAnchor:"middle",
                        fontSize:"7", fill:"#6c737a" }, String(min)),
                    // max label
                    e("text", { x:pMax.x, y:pMax.y+6, textAnchor:"middle",
                        fontSize:"7", fill:"#6c737a" }, String(max))
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
                value:         tree.readNumber("value", 0),
                min:           tree.readNumber("min", 0),
                max:           tree.readNumber("max", 100),
                unit:          tree.readString("unit", "%"),
                title:         tree.readString("title", "Gauge"),
                thresholds:    tree.read("thresholds", [{value:0,color:"#73bf69"},{value:60,color:"#f2cc0c"},{value:80,color:"#f2495c"}]),
                showValue:     tree.readBoolean("showValue", true),
                decimalPlaces: tree.readNumber("decimalPlaces", 1),
                arcWidth:      tree.readNumber("arcWidth", 18),
                startAngle:    tree.readNumber("startAngle", -120),
                endAngle:      tree.readNumber("endAngle", 120)
            };
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  SVG CHART UTILITIES
    //  All coordinate math uses svgEl.getBoundingClientRect() so that
    //  the numbers are always current (called inside event handlers,
    //  never during render).
    // ══════════════════════════════════════════════════════════════════

    /**
     * Given a mouse event and an SVG element reference,
     * returns { x, y } in SVG pixel space (top-left of SVG = 0,0).
     */
    function svgXY(evt, svgEl) {
        if (!svgEl) return { x: 0, y: 0 };
        var r = svgEl.getBoundingClientRect();
        return {
            x: evt.clientX - r.left,
            y: evt.clientY - r.top,
            w: r.width,
            h: r.height
        };
    }

    // ══════════════════════════════════════════════════════════════════
    //  3.  TIMESERIES PANEL
    //      Full Grafana feature set:
    //        • Crosshair + aligned tooltip  (coordinates from SVG rect)
    //        • Drag-to-zoom X, double-click reset
    //        • Legend click toggle
    //        • Multiple series, area fill, smooth bezier, dots
    //        • Threshold horizontal lines
    //        • Auto time X-axis labels
    // ══════════════════════════════════════════════════════════════════

    // Padding INSIDE the SVG for the axis/chart area
    var TS_PAD = { l:58, r:20, t:12, b:42 };

    class TimeSeriesComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state = {
                tooltip:   null,
                zoomRange: null,
                dragStart: null,
                dragCur:   null,
                hidden:    {}
            };
            this._svgEl = null;
        }

        _getRange(series, zoomRange) {
            var allMs = [];
            series.forEach(function(s) {
                (s.points || []).forEach(function(p) { if (p.t) allMs.push(p.t); });
            });
            if (!allMs.length) return { minMs:0, maxMs:1, minV:0, maxV:1 };
            var gMin = Math.min.apply(null, allMs);
            var gMax = Math.max.apply(null, allMs);
            var minMs = zoomRange ? zoomRange.minMs : gMin;
            var maxMs = zoomRange ? zoomRange.maxMs : gMax;
            var vals  = [];
            series.forEach(function(s) {
                (s.points || []).forEach(function(p) {
                    if (p.t >= minMs && p.t <= maxMs) vals.push(p.v);
                });
            });
            return {
                minMs: minMs, maxMs: maxMs,
                minV: vals.length ? Math.min.apply(null, vals) : 0,
                maxV: vals.length ? Math.max.apply(null, vals) : 1
            };
        }

        _handlers(series, range, lw, fillOp, showDots, smooth) {
            var self   = this;
            var pad    = TS_PAD;

            return {
                onMouseMove: function(evt) {
                    var svgEl = self._svgEl;
                    if (!svgEl) return;
                    var r  = svgEl.getBoundingClientRect();
                    var sx = evt.clientX - r.left;
                    var sy = evt.clientY - r.top;
                    var W  = r.width;
                    var H  = r.height;
                    var cW = W - pad.l - pad.r;
                    var cH = H - pad.t - pad.b;
                    var chartX = sx - pad.l;

                    if (chartX < 0 || chartX > cW || sy < pad.t || sy > pad.t + cH) {
                        self.setState({ tooltip: null });
                        if (self.state.dragStart) self.setState({ dragCur: sx });
                        return;
                    }

                    var minMs  = range.minMs, maxMs = range.maxMs;
                    var hoverMs = minMs + (chartX / cW) * (maxMs - minMs);
                    var items  = [];
                    var closestMs = null;

                    series.forEach(function(s, si) {
                        if (self.state.hidden[s.name]) return;
                        var pts = s.points || [];
                        if (!pts.length) return;
                        var best = pts[0], bestD = Math.abs(pts[0].t - hoverMs);
                        for (var i = 1; i < pts.length; i++) {
                            var d = Math.abs(pts[i].t - hoverMs);
                            if (d < bestD) { bestD = d; best = pts[i]; }
                        }
                        if (closestMs === null || bestD < Math.abs(closestMs - hoverMs)) closestMs = best.t;
                        items.push({
                            name:  s.name,
                            color: s.color || PALETTE[si % PALETTE.length],
                            value: fmtNum(best.v)
                        });
                    });

                    if (!items.length) { self.setState({ tooltip: null }); return; }
                    items[0].header = closestMs !== null ? fmtDateTime(closestMs) : "";

                    var crossX = closestMs !== null
                        ? pad.l + ((closestMs - minMs) / (maxMs - minMs || 1)) * cW
                        : sx;

                    self.setState({
                        tooltip: { sx:sx, sy:sy, crossX:crossX, items:items, cW:cW, cH:cH }
                    });
                    if (self.state.dragStart) self.setState({ dragCur: sx });
                },

                onMouseLeave: function() {
                    self.setState({ tooltip:null, dragStart:null, dragCur:null });
                },

                onMouseDown: function(evt) {
                    if (evt.button !== 0) return;
                    var svgEl = self._svgEl;
                    if (!svgEl) return;
                    var r     = svgEl.getBoundingClientRect();
                    var sx    = evt.clientX - r.left;
                    var cW    = r.width - TS_PAD.l - TS_PAD.r;
                    var chartX = sx - TS_PAD.l;
                    if (chartX < 0 || chartX > cW) return;
                    var ms = range.minMs + (chartX / cW) * (range.maxMs - range.minMs);
                    self.setState({ dragStart:{ sx:sx, ms:ms }, dragCur:sx });
                    evt.preventDefault();
                },

                onMouseUp: function(evt) {
                    var ds = self.state.dragStart;
                    if (!ds) return;
                    var svgEl = self._svgEl;
                    if (!svgEl) return;
                    var r  = svgEl.getBoundingClientRect();
                    var sx = evt.clientX - r.left;
                    var cW = r.width - TS_PAD.l - TS_PAD.r;
                    var dx = Math.abs(sx - ds.sx);
                    if (dx > 8) {
                        var ms2 = range.minMs + ((sx - TS_PAD.l) / cW) * (range.maxMs - range.minMs);
                        var lo  = Math.min(ds.ms, ms2);
                        var hi  = Math.max(ds.ms, ms2);
                        self.setState({ zoomRange:{ minMs:lo, maxMs:hi }, dragStart:null, dragCur:null });
                    } else {
                        self.setState({ dragStart:null, dragCur:null });
                    }
                },

                onDoubleClick: function() {
                    self.setState({ zoomRange:null, tooltip:null });
                }
            };
        }

        render() {
            var p = this.props.props, emit = this.props.emit, self = this;
            var series     = p.series || [{ name:"cpu", color:"#73bf69",
                points:(function(){ var now=Date.now(); return [
                    {t:now-300000,v:28},{t:now-240000,v:28},{t:now-180000,v:29},
                    {t:now-120000,v:45},{t:now-60000,v:21},{t:now,v:21}];})() }];
            var title      = p.title           || "TimeSeries Panel";
            var fillOp     = p.fillOpacity      !== undefined ? p.fillOpacity  : 0.07;
            var lw         = p.lineWidth        !== undefined ? p.lineWidth    : 2;
            var thLines    = p.thresholdLines   || [];
            var showDots   = p.showDots         !== undefined ? p.showDots     : true;
            var smooth     = !!p.smooth;
            var bgColor    = p.backgroundColor  || "#181b1f";

            var tooltip  = this.state.tooltip;
            var zoomRange= this.state.zoomRange;
            var dragStart= this.state.dragStart;
            var dragCur  = this.state.dragCur;
            var hidden   = this.state.hidden;

            var range  = this._getRange(series, zoomRange);
            var minMs  = range.minMs, maxMs = range.maxMs;
            var minV   = range.minV,  maxV  = range.maxV;
            var yTicks = niceTicks(minV, maxV, 5);
            var yMin   = yTicks[0], yMax = yTicks[yTicks.length-1];

            var pad = TS_PAD;

            // ── Coordinate helpers (use CSS % via transform on SVG 100%/100%) ──
            // We draw in a "virtual" 1000×600 coordinate system and let the SVG
            // scale via viewBox.  This way coordinates are stable during render
            // and mouse events use getBoundingClientRect() for precision.
            var VW = 1000, VH = 600;
            var cW = VW - pad.l - pad.r;
            var cH = VH - pad.t - pad.b;

            function msToX(ms) {
                return pad.l + ((ms - minMs) / (maxMs - minMs || 1)) * cW;
            }
            function vToY(v) {
                return pad.t + cH - ((v - yMin) / (yMax - yMin || 1)) * cH;
            }

            // Time X-ticks
            var span      = maxMs - minMs || 1;
            var msPerTick = niceNum(span / 6, true);
            var firstTick = Math.ceil(minMs / msPerTick) * msPerTick;
            var xTicks    = [];
            for (var t = firstTick; t <= maxMs; t += msPerTick) xTicks.push(t);

            function buildLinePath(pts) {
                var vis = pts.filter(function(p){ return p.t >= minMs && p.t <= maxMs; });
                if (!vis.length) return "";
                if (!smooth) {
                    return vis.map(function(p,i){
                        return (i===0?"M":"L") + msToX(p.t).toFixed(1) + "," + vToY(p.v).toFixed(1);
                    }).join(" ");
                }
                var d = "M" + msToX(vis[0].t).toFixed(1) + "," + vToY(vis[0].v).toFixed(1);
                for (var i = 1; i < vis.length; i++) {
                    var x0=msToX(vis[i-1].t), y0=vToY(vis[i-1].v);
                    var x1=msToX(vis[i].t),   y1=vToY(vis[i].v);
                    var cx=(x0+x1)/2;
                    d += " C"+cx.toFixed(1)+","+y0.toFixed(1)+" "+cx.toFixed(1)+","+y1.toFixed(1)+" "+x1.toFixed(1)+","+y1.toFixed(1);
                }
                return d;
            }

            // ── Tooltip overlay (pixel coords relative to SVG element) ──
            var tooltipEl = null;
            if (tooltip) {
                tooltipEl = e(TooltipBox, {
                    x:    tooltip.sx,
                    y:    tooltip.sy,
                    items:tooltip.items,
                    cW:   tooltip.cW + pad.l + pad.r,
                    cH:   tooltip.cH + pad.t + pad.b
                });
            }

            // ── Zoom/crosshair overlays (pixel coords) ──
            // We convert virtual coords back to % for the overlay divs
            var crosshairEl = null;
            if (tooltip && tooltip.crossX !== undefined) {
                // tooltip.crossX is in virtual SVG coords (0..VW)
                // convert to % of SVG element width
                crosshairEl = e("line", {
                    x1:tooltip.crossX, y1:pad.t,
                    x2:tooltip.crossX, y2:pad.t+cH,
                    stroke:"rgba(255,255,255,0.3)", strokeWidth:1
                });
            }

            var zoomRectEl = null;
            if (dragStart && dragCur !== null) {
                // dragStart.sx and dragCur are in SVG pixel coords;
                // we need virtual coords for the SVG rect
                // We'll store them in SVG virtual space on mousedown instead.
                // (See _handlers — we store ms. Convert back here.)
                var dsVX = pad.l + ((dragStart.ms - minMs) / (maxMs - minMs || 1)) * cW;
                var dcMS = range.minMs + ((dragCur - pad.l) / (tooltip ? tooltip.cW : cW)) * (maxMs - minMs);
                var dcVX = pad.l + ((dcMS - minMs) / (maxMs - minMs || 1)) * cW;
                var rx   = Math.min(dsVX, dcVX);
                var rw   = Math.abs(dsVX - dcVX);
                zoomRectEl = e("rect", {
                    x:rx, y:pad.t, width:rw, height:cH,
                    fill:"rgba(255,255,255,0.07)",
                    stroke:"rgba(255,255,255,0.25)", strokeWidth:1
                });
            }

            var handlers = this._handlers(series, range, lw, fillOp, showDots, smooth);

            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex", flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235", borderRadius:"4px"
                }
            }),
                // ── Header ──
                e("div", { style:{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"8px 12px 4px", flexShrink:0, height:"36px"
                }},
                    e("span", { style:{ fontSize:"13px", fontWeight:500, color:"#d8d9da" }}, title),
                    e("div", { style:{ display:"flex", gap:"8px", alignItems:"center" }},
                        zoomRange
                            ? e("span", {
                                onClick: function(){ self.setState({ zoomRange:null, tooltip:null }); },
                                style:{ fontSize:"11px", color:"#f2cc0c", cursor:"pointer",
                                    backgroundColor:"rgba(242,204,12,0.12)",
                                    borderRadius:"3px", padding:"2px 8px" }
                              }, "\u27F3 Reset zoom")
                            : null,
                        e("span", { style:{ fontSize:"18px", color:"#6c737a", cursor:"pointer" }}, "\u22EE")
                    )
                ),
                // ── Chart + tooltip wrapper ──
                e("div", Object.assign({
                    style:{
                        flex:1, position:"relative", overflow:"hidden",
                        cursor: dragStart ? "ew-resize" : "crosshair"
                    }
                }, handlers),
                    // SVG fills wrapper completely
                    e("svg", {
                        ref: function(r){ self._svgEl = r; },
                        viewBox: "0 0 " + VW + " " + VH,
                        preserveAspectRatio:"none",
                        style:{ display:"block", width:"100%", height:"100%" }
                    },
                        // Y grid + labels
                        yTicks.map(function(v, i){
                            var y = vToY(v);
                            return e("g", { key:"gy"+i },
                                e("line", { x1:pad.l, y1:y, x2:pad.l+cW, y2:y, stroke:"#2c3235", strokeWidth:1 }),
                                e("text", { x:pad.l-6, y:y+4, textAnchor:"end", fontSize:"28", fill:"#6c737a" }, fmtNum(v))
                            );
                        }),
                        // X grid + time labels
                        xTicks.filter(function(t){ return t >= minMs && t <= maxMs; }).map(function(t, i){
                            var x = msToX(t);
                            return e("g", { key:"gx"+i },
                                e("line", { x1:x, y1:pad.t, x2:x, y2:pad.t+cH, stroke:"#2c3235", strokeWidth:1 }),
                                e("text", { x:x, y:pad.t+cH+28, textAnchor:"middle", fontSize:"24", fill:"#6c737a" }, fmtTime(t))
                            );
                        }),
                        // Threshold lines
                        thLines.map(function(th, i){
                            var y = vToY(th.value);
                            return e("g", { key:"th"+i },
                                e("line", { x1:pad.l, y1:y, x2:pad.l+cW, y2:y,
                                    stroke:th.color||"#f2495c", strokeWidth:2, strokeDasharray:"12 6" }),
                                e("text", { x:pad.l+cW+4, y:y+4, fontSize:"22", fill:th.color||"#f2495c" }, th.label||"")
                            );
                        }),
                        // Axes
                        e("line", { x1:pad.l, y1:pad.t, x2:pad.l, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        e("line", { x1:pad.l, y1:pad.t+cH, x2:pad.l+cW, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        // Series
                        series.map(function(s, si){
                            if (hidden[s.name]) return null;
                            var color = s.color || PALETTE[si % PALETTE.length];
                            var pts   = s.points || [];
                            var path  = buildLinePath(pts);
                            var vis   = pts.filter(function(p){ return p.t >= minMs && p.t <= maxMs; });
                            var fillD = (fillOp > 0 && path && vis.length)
                                ? path + " L"+msToX(vis[vis.length-1].t).toFixed(1)+","+(pad.t+cH).toFixed(1)
                                       +" L"+msToX(vis[0].t).toFixed(1)+","+(pad.t+cH).toFixed(1)+" Z"
                                : null;
                            var strokeW = lw * (VW / 1000) * 3;  // scale stroke to viewBox
                            return e("g", { key:"s"+si },
                                fillD ? e("path", { d:fillD, fill:color, fillOpacity:fillOp, stroke:"none" }) : null,
                                path  ? e("path", { d:path,  fill:"none", stroke:color,
                                    strokeWidth: strokeW,
                                    strokeLinejoin:"round", strokeLinecap:"round" }) : null,
                                showDots ? vis.map(function(pt, i){
                                    return e("circle", { key:"d"+i,
                                        cx:msToX(pt.t).toFixed(1), cy:vToY(pt.v).toFixed(1),
                                        r:5, fill:color, stroke:"#181b1f", strokeWidth:2 });
                                }) : null
                            );
                        }).filter(Boolean),
                        crosshairEl,
                        zoomRectEl
                    ),
                    // Tooltip overlay (absolute, pixel coords)
                    tooltipEl
                ),
                // ── Legend ──
                e("div", { style:{
                    display:"flex", flexWrap:"wrap", gap:"12px",
                    padding:"4px 12px 8px", flexShrink:0,
                    alignItems:"center", height:"32px"
                }},
                    series.map(function(s, i){
                        var color = s.color || PALETTE[i % PALETTE.length];
                        return e("div", {
                            key:"l"+i,
                            onClick: function(){ self.setState(function(prev){
                                var h = Object.assign({}, prev.hidden);
                                h[s.name] = !h[s.name];
                                return { hidden:h };
                            }); },
                            style:{ display:"flex", alignItems:"center", gap:"6px",
                                cursor:"pointer", opacity: hidden[s.name] ? 0.3 : 1,
                                transition:"opacity 0.2s" }
                        },
                            e("span", { style:{ display:"inline-block", width:"14px", height:"3px",
                                backgroundColor:color, borderRadius:"2px" }}),
                            e("span", { style:{ fontSize:"12px", color:"#9fa7b3", userSelect:"none" }}, s.name)
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
            var now = Date.now();
            return {
                series:          tree.read("series",[{name:"cpu",color:"#73bf69",points:[
                    {t:now-300000,v:28},{t:now-240000,v:28},{t:now-180000,v:29},
                    {t:now-120000,v:45},{t:now-60000, v:21},{t:now,       v:21}]}]),
                title:           tree.readString("title","TimeSeries Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                fillOpacity:     tree.readNumber("fillOpacity",0.07),
                lineWidth:       tree.readNumber("lineWidth",2),
                showDots:        tree.readBoolean("showDots",true),
                smooth:          tree.readBoolean("smooth",false),
                thresholdLines:  tree.read("thresholdLines",[])
            };
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  4.  LINE CHART
    // ══════════════════════════════════════════════════════════════════

    var LC_PAD = { l:50, r:16, t:10, b:36 };

    class LineChartComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state  = { tooltip: null };
            this._svgEl = null;
        }

        render() {
            var p      = this.props.props, emit = this.props.emit, self = this;
            var series     = p.series     || [{ name:"Series A", color:"#5794f2", data:[10,40,30,60,45,75,55] }];
            var labels     = p.labels     || [];
            var title      = p.title      || "Line Chart";
            var showDots   = p.showDots   !== undefined ? p.showDots   : true;
            var showGrid   = p.showGrid   !== undefined ? p.showGrid   : true;
            var showLegend = p.showLegend !== undefined ? p.showLegend : true;
            var smooth     = !!p.smooth;
            var fillArea   = !!p.fillArea;
            var bgColor    = p.backgroundColor || "#181b1f";

            var tooltip  = this.state.tooltip;
            var HEADER_H = 36, LEGEND_H = showLegend ? 28 : 0;
            var pad      = LC_PAD;

            var allVals = [];
            series.forEach(function(s){ (s.data||[]).forEach(function(v){ allVals.push(v); }); });

            if (!allVals.length) {
                return e("div", Object.assign({}, emit(), {
                    style:{ boxSizing:"border-box", overflow:"hidden",
                            display:"flex", alignItems:"center",
                            justifyContent:"center", backgroundColor:bgColor, color:"#6c737a" }
                }), "No data");
            }

            var VW = 1000, VH = 600;
            var cW = VW - pad.l - pad.r;
            var cH = VH - pad.t - pad.b;

            var maxPts  = Math.max.apply(null, series.map(function(s){ return (s.data||[]).length; }));
            var dataMin = Math.min.apply(null, allVals);
            var dataMax = Math.max.apply(null, allVals);
            var yTicks  = niceTicks(dataMin, dataMax, 5);
            var yMin    = yTicks[0], yMax = yTicks[yTicks.length-1];

            function xPos(i) { return pad.l + (maxPts <= 1 ? cW/2 : (i / (maxPts-1)) * cW); }
            function yPos(v) { return pad.t + cH - ((v - yMin) / (yMax - yMin || 1)) * cH; }

            function buildPath(data) {
                if (!data || !data.length) return "";
                if (!smooth) {
                    return data.map(function(v,i){
                        return (i===0?"M":"L") + xPos(i).toFixed(1) + "," + yPos(v).toFixed(1);
                    }).join(" ");
                }
                var d = "M"+xPos(0).toFixed(1)+","+yPos(data[0]).toFixed(1);
                for (var i=1; i<data.length; i++) {
                    var x0=xPos(i-1), y0=yPos(data[i-1]), x1=xPos(i), y1=yPos(data[i]), cx=(x0+x1)/2;
                    d += " C"+cx.toFixed(1)+","+y0.toFixed(1)+" "+cx.toFixed(1)+","+y1.toFixed(1)+" "+x1.toFixed(1)+","+y1.toFixed(1);
                }
                return d;
            }

            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex", flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235", borderRadius:"4px"
                }
            }),
                // Header
                e("div", { style:{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"8px 12px 4px", height:HEADER_H+"px", flexShrink:0
                }},
                    e("span", { style:{ fontSize:"13px", fontWeight:500, color:"#d8d9da" }}, title),
                    e("span", { style:{ fontSize:"18px", color:"#6c737a", cursor:"pointer" }}, "\u22EE")
                ),
                // Chart
                e("div", {
                    style:{ flex:1, position:"relative", overflow:"hidden" },
                    onMouseMove: function(evt) {
                        var svgEl = self._svgEl;
                        if (!svgEl) return;
                        var r  = svgEl.getBoundingClientRect();
                        var sx = evt.clientX - r.left;
                        var sy = evt.clientY - r.top;
                        var W  = r.width, H = r.height;
                        // Map to virtual coords
                        var vx = (sx / W) * VW;
                        var vy = (sy / H) * VH;
                        var chartX = vx - pad.l;
                        if (chartX < 0 || chartX > cW) { self.setState({tooltip:null}); return; }
                        var idx = Math.round((chartX / cW) * (maxPts - 1));
                        idx = clamp(idx, 0, maxPts-1);
                        var items = series.map(function(s, si){
                            var v = (s.data||[])[idx];
                            return { name:s.name, color:s.color||PALETTE[si%PALETTE.length],
                                     value: v !== undefined ? fmtNum(v) : "" };
                        }).filter(function(it){ return it.value !== ""; });
                        if (labels[idx]) items.unshift({ header:labels[idx] });
                        self.setState({ tooltip:{ sx:sx, sy:sy, items:items, cW:W, cH:H } });
                    },
                    onMouseLeave: function() { self.setState({tooltip:null}); }
                },
                    e("svg", {
                        ref: function(r){ self._svgEl = r; },
                        viewBox: "0 0 "+VW+" "+VH,
                        preserveAspectRatio:"none",
                        style:{ display:"block", width:"100%", height:"100%" }
                    },
                        // Y grid
                        showGrid ? yTicks.map(function(v, i){
                            var y = yPos(v);
                            return e("g", { key:"gy"+i },
                                e("line", { x1:pad.l, y1:y, x2:pad.l+cW, y2:y, stroke:"#2c3235", strokeWidth:1 }),
                                e("text", { x:pad.l-6, y:y+4, textAnchor:"end", fontSize:"28", fill:"#6c737a" }, fmtNum(v))
                            );
                        }) : null,
                        // X labels
                        labels.map(function(lbl, i){
                            var step = Math.max(1, Math.floor(maxPts / 7));
                            if (i % step !== 0 && i !== maxPts-1) return null;
                            return e("text", { key:"xl"+i,
                                x:xPos(i), y:pad.t+cH+28,
                                textAnchor:"middle", fontSize:"24", fill:"#6c737a" }, lbl);
                        }).filter(Boolean),
                        // Axes
                        e("line", { x1:pad.l, y1:pad.t, x2:pad.l, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        e("line", { x1:pad.l, y1:pad.t+cH, x2:pad.l+cW, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        // Series
                        series.map(function(s, si){
                            var color = s.color || PALETTE[si % PALETTE.length];
                            var path  = buildPath(s.data || []);
                            var fillD = (fillArea && path && (s.data||[]).length)
                                ? path + " L"+xPos((s.data||[]).length-1).toFixed(1)+","+(pad.t+cH).toFixed(1)
                                       +" L"+pad.l.toFixed(1)+","+(pad.t+cH).toFixed(1)+" Z"
                                : null;
                            return e("g", { key:"s"+si },
                                fillD ? e("path", { d:fillD, fill:color, fillOpacity:0.1, stroke:"none" }) : null,
                                path  ? e("path", { d:path,  fill:"none", stroke:color,
                                    strokeWidth:5, strokeLinejoin:"round", strokeLinecap:"round" }) : null,
                                showDots ? (s.data||[]).map(function(v, i){
                                    return e("circle", { key:"d"+i,
                                        cx:xPos(i).toFixed(1), cy:yPos(v).toFixed(1),
                                        r:6, fill:color, stroke:"#181b1f", strokeWidth:2 });
                                }) : null
                            );
                        })
                    ),
                    tooltip ? e(TooltipBox, {
                        x:tooltip.sx, y:tooltip.sy, items:tooltip.items,
                        cW:tooltip.cW, cH:tooltip.cH
                    }) : null
                ),
                // Legend
                showLegend ? e("div", { style:{
                    display:"flex", flexWrap:"wrap", gap:"12px",
                    padding:"2px 12px 6px", height:LEGEND_H+"px",
                    flexShrink:0, alignItems:"center"
                }},
                    series.map(function(s, i){
                        var color = s.color || PALETTE[i % PALETTE.length];
                        return e("div", { key:"l"+i,
                            style:{ display:"flex", alignItems:"center", gap:"6px" }},
                            e("span", { style:{ display:"inline-block", width:"14px", height:"3px",
                                backgroundColor:color, borderRadius:"2px" }}),
                            e("span", { style:{ fontSize:"12px", color:"#9fa7b3" }}, s.name)
                        );
                    })
                ) : null
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

    // ══════════════════════════════════════════════════════════════════
    //  5.  BAR CHART PANEL
    // ══════════════════════════════════════════════════════════════════

    var BC_PAD = { l:44, r:16, t:10, b:36 };

    class BarChartComponent extends Cmp {
        constructor(props) {
            super(props);
            this.state  = { tooltip:null, hidden:{}, hoverBar:null };
            this._svgEl = null;
        }

        render() {
            var p       = this.props.props, emit = this.props.emit, self = this;
            var series    = p.series || [{name:"Series A",color:"#73bf69",
                data:[{label:"Jan",v:30},{label:"Feb",v:45},{label:"Mar",v:28},{label:"Apr",v:55},{label:"May",v:40}]}];
            var title     = p.title           || "Bar Chart Panel";
            var bgColor   = p.backgroundColor || "#181b1f";
            var barRadius = p.barRadius        !== undefined ? p.barRadius : 3;
            var showVals  = !!p.showValues;

            var tooltip  = this.state.tooltip;
            var hidden   = this.state.hidden;
            var hoverBar = this.state.hoverBar;

            var VW = 1000, VH = 600;
            var pad = BC_PAD;
            var cW = VW - pad.l - pad.r;
            var cH = VH - pad.t - pad.b;

            var visSeries = series.filter(function(s){ return !hidden[s.name]; });
            var allVals   = [];
            visSeries.forEach(function(s){
                (s.data||[]).forEach(function(d){ allVals.push(typeof d==="object"?d.v:d); });
            });
            var dataMax  = allVals.length ? Math.max.apply(null, allVals) : 1;
            var yTicks   = niceTicks(0, dataMax, 5);
            var axisMax  = yTicks[yTicks.length-1] || dataMax || 1;

            var maxCats  = Math.max.apply(null, series.map(function(s){ return (s.data||[]).length; }));
            maxCats      = maxCats || 1;
            var groupW   = cW / maxCats;
            var barCount = visSeries.length || 1;
            var innerW   = groupW * 0.72;
            var barW     = innerW / barCount;
            var groupOff = (groupW - innerW) / 2;

            var allBars = [];
            visSeries.forEach(function(s, si){
                var color = s.color || PALETTE[si % PALETTE.length];
                (s.data||[]).forEach(function(d, di){
                    var v   = typeof d==="object" ? d.v : d;
                    var lbl = typeof d==="object" ? (d.label||String(di)) : String(di);
                    var bH  = Math.max(0, (v / axisMax) * cH);
                    var bX  = pad.l + groupOff + di*groupW + si*barW;
                    var bY  = pad.t + cH - bH;
                    allBars.push({ id:si+"-"+di, x:bX, w:barW-3, y:bY, h:bH,
                        v:v, label:lbl, seriesName:s.name, color:color,
                        extraProps: typeof d==="object" ? d.extraProps : undefined });
                });
            });

            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    display:"flex", flexDirection:"column",
                    fontFamily:"'Roboto','Inter',sans-serif",
                    border:"1px solid #2c3235", borderRadius:"4px"
                }
            }),
                // Header
                e("div", { style:{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"8px 12px 4px", height:"36px", flexShrink:0
                }},
                    e("span", { style:{ fontSize:"13px", fontWeight:500, color:"#d8d9da" }}, title),
                    e("span", { style:{ fontSize:"18px", color:"#6c737a", cursor:"pointer" }}, "\u22EE")
                ),
                // Chart + tooltip
                e("div", {
                    style:{ flex:1, position:"relative", overflow:"hidden" },
                    onMouseMove: function(evt) {
                        var svgEl = self._svgEl;
                        if (!svgEl) return;
                        var r  = svgEl.getBoundingClientRect();
                        var sx = evt.clientX - r.left;
                        var sy = evt.clientY - r.top;
                        var W  = r.width, H = r.height;
                        // Map to virtual coords
                        var vx = (sx / W) * VW;
                        var vy = (sy / H) * VH;
                        var found = null;
                        for (var i=0; i<allBars.length; i++) {
                            var bar = allBars[i];
                            if (vx >= bar.x && vx <= bar.x+bar.w && vy >= bar.y && vy <= bar.y+bar.h) {
                                found = bar; break;
                            }
                        }
                        if (found) {
                            var items = [
                                { header:found.label },
                                { name:found.seriesName, color:found.color, value:String(found.v) }
                            ];
                            if (found.extraProps) {
                                found.extraProps.forEach(function(ep){
                                    items.push({ name:ep.name, color:"", value:ep.value });
                                });
                            }
                            self.setState({ tooltip:{ sx:sx, sy:sy, items:items, cW:W, cH:H }, hoverBar:found.id });
                        } else {
                            self.setState({ tooltip:null, hoverBar:null });
                        }
                    },
                    onMouseLeave: function(){ self.setState({ tooltip:null, hoverBar:null }); }
                },
                    e("svg", {
                        ref: function(r){ self._svgEl = r; },
                        viewBox: "0 0 "+VW+" "+VH,
                        preserveAspectRatio:"none",
                        style:{ display:"block", width:"100%", height:"100%" }
                    },
                        // Y grid
                        yTicks.map(function(v, i){
                            var y = pad.t + cH - (v / axisMax) * cH;
                            return e("g", { key:"gy"+i },
                                e("line", { x1:pad.l, y1:y, x2:pad.l+cW, y2:y, stroke:"#2c3235", strokeWidth:1 }),
                                e("text", { x:pad.l-5, y:y+4, textAnchor:"end", fontSize:"28", fill:"#6c737a" }, fmtNum(v))
                            );
                        }),
                        e("line", { x1:pad.l, y1:pad.t, x2:pad.l, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        e("line", { x1:pad.l, y1:pad.t+cH, x2:pad.l+cW, y2:pad.t+cH, stroke:"#4a5568", strokeWidth:1 }),
                        // Bars
                        allBars.map(function(bar){
                            var r2 = Math.min(barRadius * (VW/1000) * 5, bar.h / 2);
                            return e("g", { key:"b"+bar.id },
                                e("rect", { x:bar.x, y:bar.y, width:bar.w, height:bar.h,
                                    fill:bar.color, fillOpacity: hoverBar===bar.id ? 1 : 0.8,
                                    rx:r2, ry:r2 }),
                                (showVals && bar.h > 20)
                                    ? e("text", { x:bar.x+bar.w/2, y:bar.y-6,
                                        textAnchor:"middle", fontSize:"22", fill:"#d8d9da" }, String(bar.v))
                                    : null
                            );
                        }),
                        // X labels
                        Array.from({ length:maxCats }, function(_, di){
                            var cx  = pad.l + groupOff + di*groupW + innerW/2;
                            var d   = (series[0] && series[0].data) ? series[0].data[di] : undefined;
                            var txt = d ? (typeof d==="object" ? d.label : String(di)) : "";
                            return e("text", { key:"xl"+di, x:cx, y:pad.t+cH+28,
                                textAnchor:"middle", fontSize:"24", fill:"#6c737a" }, txt);
                        })
                    ),
                    tooltip ? e(TooltipBox, {
                        x:tooltip.sx, y:tooltip.sy, items:tooltip.items,
                        cW:tooltip.cW, cH:tooltip.cH
                    }) : null
                ),
                // Legend
                e("div", { style:{
                    display:"flex", flexWrap:"wrap", gap:"12px",
                    padding:"4px 12px 6px", height:"32px",
                    flexShrink:0, alignItems:"center"
                }},
                    series.map(function(s, i){
                        var color = s.color || PALETTE[i % PALETTE.length];
                        return e("div", { key:"l"+i,
                            onClick: function(){ self.setState(function(prev){
                                var h = Object.assign({}, prev.hidden);
                                h[s.name] = !h[s.name];
                                return { hidden:h };
                            }); },
                            style:{ display:"flex", alignItems:"center", gap:"6px",
                                cursor:"pointer", opacity: hidden[s.name] ? 0.3 : 1,
                                transition:"opacity 0.2s" }
                        },
                            e("span", { style:{ display:"inline-block", width:"14px", height:"10px",
                                backgroundColor:color, borderRadius:"2px" }}),
                            e("span", { style:{ fontSize:"12px", color:"#9fa7b3", userSelect:"none" }}, s.name)
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
                    data:[{label:"Jan",v:30},{label:"Feb",v:45},{label:"Mar",v:28},{label:"Apr",v:55},{label:"May",v:40}]}]),
                title:           tree.readString("title","Bar Chart Panel"),
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                barRadius:       tree.readNumber("barRadius",3),
                showValues:      tree.readBoolean("showValues",false)
            };
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  6.  STAT CARD
    // ══════════════════════════════════════════════════════════════════

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

    class StatCardComponent extends Cmp {
        render() {
            var p        = this.props.props, emit = this.props.emit;
            var value      = p.value      !== undefined ? p.value      : 0;
            var label      = p.label      !== undefined ? p.label      : "Total Value";
            var unit       = p.unit       || "";
            var dec        = p.decimalPlaces !== undefined ? p.decimalPlaces : 1;
            var trend      = p.trend      || "none";
            var trendVal   = p.trendValue || "";
            var icon       = p.icon       || "none";
            var accent     = p.accentColor    || "#3b82f6";
            var bgColor    = p.backgroundColor|| "#181b1f";
            var valColor   = p.valueColor     || "#d8d9da";
            var lblColor   = p.labelColor     || "#9fa7b3";
            var showBorder = p.showBorder      !== undefined ? p.showBorder : true;

            var trendColor = trend==="up" ? "#73bf69" : trend==="down" ? "#f2495c" : "#9fa7b3";

            return e("div", Object.assign({}, emit(), {
                style:{
                    boxSizing:"border-box", overflow:"hidden",
                    backgroundColor:bgColor,
                    borderRadius:"4px",
                    border: showBorder ? "1px solid #2c3235" : "none",
                    padding:"16px",
                    display:"flex", flexDirection:"column",
                    justifyContent:"space-between",
                    fontFamily:"'Roboto','Inter',sans-serif"
                }
            }),
                e("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }},
                    e("span", { style:{ fontSize:"13px", color:lblColor, fontWeight:500, lineHeight:"1.3" }}, label),
                    (icon !== "none" && ICON_PATHS[icon])
                        ? e("div", { style:{
                            width:"32px", height:"32px", borderRadius:"6px",
                            backgroundColor:hexAlpha(accent,0.15),
                            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0
                          }},
                            e("svg", { width:"16", height:"16", viewBox:"0 0 24 24", fill:"none",
                                stroke:accent, strokeWidth:"2", strokeLinecap:"round", strokeLinejoin:"round" },
                                e("path", { d:ICON_PATHS[icon] }))
                          )
                        : null
                ),
                e("div", { style:{ display:"flex", alignItems:"baseline", gap:"4px", marginTop:"8px" }},
                    e("span", { style:{ fontSize:"28px", fontWeight:"700", color:valColor, lineHeight:"1" }},
                        Number(value).toFixed(dec)),
                    unit ? e("span", { style:{ fontSize:"14px", color:lblColor, marginBottom:"2px" }}, unit) : null
                ),
                (trend !== "none")
                    ? e("div", { style:{ display:"flex", alignItems:"center", gap:"4px", marginTop:"6px" }},
                        e("svg", { width:"13", height:"13", viewBox:"0 0 24 24", fill:"none",
                            stroke:trendColor, strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round" },
                            e("path", { d: TREND_PATHS[trend] || "" })),
                        trendVal ? e("span", { style:{ fontSize:"12px", color:trendColor, fontWeight:"600" }}, trendVal) : null
                      )
                    : null
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
                backgroundColor: tree.readString("backgroundColor","#181b1f"),
                valueColor:      tree.readString("valueColor","#d8d9da"),
                labelColor:      tree.readString("labelColor","#9fa7b3"),
                showBorder:      tree.readBoolean("showBorder",true)
            };
        }
    }

    // ══════════════════════════════════════════════════════════════════
    //  REGISTER
    // ══════════════════════════════════════════════════════════════════
    CR.register(new StatusIndicatorMeta());
    CR.register(new GaugeMeta());
    CR.register(new TimeSeriesMeta());
    CR.register(new LineChartMeta());
    CR.register(new BarChartMeta());
    CR.register(new StatCardMeta());

    console.log("[CustomComponents v4] 6 components registered. Size fix: emit() only, no extra w/h. Hover fix: viewBox+getBCR.");

})();
