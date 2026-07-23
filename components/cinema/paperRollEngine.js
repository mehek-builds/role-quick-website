// @ts-nocheck
/* The Application Roll - live WebGL opening for the Litos hero.
   createPaperRoll(container) mounts a canvas into `container`, prints the
   job hunt on an endless white floor, and returns { stop } for the
   dissolve-on-scroll handoff. See DESIGN.md ledger 2026-07-23. */
import * as THREE from "three";

export function createPaperRoll(container) {

        /* ============================================================
     THE APPLICATION ROLL - Litos hero opening
     A drum unrolls an endless strip of paper, printing the job
     hunt in its wake: 24 unique sheets (5 resumes, postings,
     portal forms, invites, rejections, offers) on a 6x4 grid
     atlas resolved per-fragment in the shaders. One ribbon mesh,
     fixed vertex budget, zero per-frame allocations. Ported from
     the standalone paper-roll demo; HUD, pause, and debug views
     stripped, canvas + input scoped to the given container,
     scene rethemed to the site's white canvas.
     ============================================================ */

        // ---------- Constants ----------
        var RIBBON_W = 1.5; // paper width
        var CARDS_PER_REV = 8; // sheets laid down per drum revolution
        var ATLAS_N = 24; // unique sheets in the atlas (6x4 grid)
        var ATLAS_COLS = 6;
        var ATLAS_ROWS = 4;
        var ROLL_R = 1.75;
        // one revolution lays down CARDS_PER_REV sheets; the 24-sheet atlas
        // spans three revolutions, so a sheet repeats only every three turns
        var CARD_LEN = (2 * Math.PI * ROLL_R) / CARDS_PER_REV;
        var U_SPAN = CARD_LEN * ATLAS_N; // one full atlas cycle on the floor

        // Shared GLSL: resolve a continuous along-ribbon u into the 6x4
        // grid atlas per fragment, so sheet boundaries never smear.
        function gridMapChunk(uExpr, extra) {
          return (
            "#ifdef USE_MAP\n" +
            "  float contU = " + uExpr + ";\n" +
            "  float cardIdx = floor(contU * " + ATLAS_N + ".0);\n" +
            "  float cardFrac = fract(contU * " + ATLAS_N + ".0);\n" +
            "  float gcol = mod(cardIdx, " + ATLAS_COLS + ".0);\n" +
            "  float grow = floor(cardIdx / " + ATLAS_COLS + ".0);\n" +
            "  vec2 gridUv = vec2((gcol + cardFrac) / " + ATLAS_COLS + ".0, (" + (ATLAS_ROWS - 1) + ".0 - grow + vUv.y) / " + ATLAS_ROWS + ".0);\n" +
            "  vec4 texelColor = texture2D(map, gridUv);\n" +
            "  texelColor = mapTexelToLinear(texelColor);\n" +
            "  diffuseColor *= texelColor;\n" +
            "#endif\n" +
            (extra || "")
          );
        }
        var INNER_R = ROLL_R * 0.52;
        var STEP = 0.12; // path sampling distance
        var MAX_PTS = 760; // fixed history budget (~91 world units of trail)
        var CURL_SEG = 16; // segments peeling off the roll
        var MAX_SEG = MAX_PTS + CURL_SEG + 2;
        var FLOOR_RGB = "vec3(0.984, 0.980, 0.973)";

        // ---------- Renderer / scene ----------
        var stopped = false;
        var canvas = document.createElement("canvas");
        canvas.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;display:block;";
        container.appendChild(canvas);
        var vw = container.clientWidth || window.innerWidth || 1;
        var vh = container.clientHeight || window.innerHeight || 1;
        var coarse =
          !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        var renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
        });
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2),
        );
        renderer.setSize(vw, vh);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;

        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);
        scene.fog = new THREE.Fog(0xffffff, 30, 85);

        var camera = new THREE.PerspectiveCamera(32, vw / vh, 0.5, 200);

        // ---------- Lighting ----------
        var hemi = new THREE.HemisphereLight(0xffffff, 0xd6d6da, 0.95);
        scene.add(hemi);

        var sun = new THREE.DirectionalLight(0xffffff, 0.85);
        sun.castShadow = true;
        sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
        sun.shadow.camera.left = -9;
        sun.shadow.camera.right = 9;
        sun.shadow.camera.top = 9;
        sun.shadow.camera.bottom = -9;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 40;
        sun.shadow.bias = -0.0004;
        sun.shadow.normalBias = 0.02;
        scene.add(sun);
        scene.add(sun.target);

        var fill = new THREE.DirectionalLight(0xffffff, 0.22);
        fill.position.set(-6, 4, -8);
        scene.add(fill);

        // ---------- Floor ----------
        var floor = new THREE.Mesh(
          new THREE.PlaneGeometry(400, 400),
          new THREE.MeshStandardMaterial({
            color: 0xfbfaf8,
            roughness: 1.0,
            metalness: 0,
          }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        // ============================================================
        // Procedural texture atlas - 24 job application documents
        // in a 6x4 grid. Interns, new grads, APM programs, analysts,
        // designers, bankers: postings, five resumes with different
        // names, portal forms, assessments, invites, rejections,
        // offers, even the tracker spreadsheet. The ribbon repeats
        // only every three drum revolutions.
        // ============================================================
        var seed = 7;
        function rand() {
          seed = (seed * 16807) % 2147483647;
          return (seed - 1) / 2147483646;
        }

        function buildAtlas() {
          var BASE = 1024; // design space per cell
          var maxTex = renderer.capabilities.maxTextureSize || 4096;
          var CELL = maxTex >= 16384 ? 1024 : maxTex >= 8192 ? 768 : 512;
          var K = CELL / BASE;
          var cv = document.createElement("canvas");
          cv.width = CELL * ATLAS_COLS;
          cv.height = CELL * ATLAS_ROWS;
          var g = cv.getContext("2d");

          var INK = "#141417",
            BODY = "#2c2c33",
            SUB = "#55555c",
            FAINT = "#8d8d94",
            PAPER = "#fdfdfb",
            LINE = "rgba(20,20,25,0.14)";
          var BLUE = "#0b5cd6",
            GBLUE = "#1a73e8",
            GREEN = "#15803d",
            RED = "#d93025",
            INDIGO = "#4f46e5",
            TEAL = "#0f766e",
            ORANGE = "#e4551f",
            NAVY = "#1e3a5f",
            SLATE = "#475569",
            LNKD = "#0a66c2",
            HIGHLIGHT = "rgba(255,214,10,0.34)";
          var SANS =
            '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
          var SERIF = 'Georgia, "Times New Roman", serif';
          var MONOF = '"SF Mono", Menlo, Consolas, monospace';
          var SCRIPT =
            '"Snell Roundhand", "Segoe Script", "Brush Script MT", cursive';

          // paper strip base
          g.fillStyle = "#f6f5f1";
          g.fillRect(0, 0, cv.width, cv.height);
          // faint fibre grain, density matched to the original strip
          var GRAIN = Math.round(
            (2600 * (cv.width * cv.height)) / (4096 * 512),
          );
          for (var i = 0; i < GRAIN; i++) {
            g.fillStyle = "rgba(120,116,105," + (0.015 + rand() * 0.03) + ")";
            g.fillRect(
              rand() * cv.width,
              rand() * cv.height,
              1 + rand() * 2,
              1,
            );
          }

          // ---------- typography + widget helpers (1024-space) ----------
          var TSCALE = 1.08; // slight uniform bump for at-distance legibility
          function fontStr(style, weight, size, fam) {
            return (
              (style ? style + " " : "") +
              weight +
              " " +
              (size * TSCALE).toFixed(2) +
              "px " +
              fam
            );
          }
          function txt(x, y, s, o) {
            o = o || {};
            g.save();
            if (o.ls && "letterSpacing" in g) g.letterSpacing = o.ls + "px";
            g.fillStyle = o.color || INK;
            g.font = fontStr(o.style, o.weight || 400, o.size || 15, o.fam || SANS);
            g.textAlign = o.align || "left";
            g.textBaseline = o.baseline || "alphabetic";
            g.fillText(s, x, y);
            g.restore();
          }
          function measure(s, o) {
            o = o || {};
            g.save();
            g.font = fontStr(o.style, o.weight || 400, o.size || 15, o.fam || SANS);
            var w = g.measureText(s).width;
            g.restore();
            return w;
          }
          function wrap(x, y, w, s, o) {
            o = o || {};
            var size = o.size || 15.5;
            var lh = o.lh || Math.round(size * 1.55);
            g.save();
            g.fillStyle = o.color || BODY;
            g.font = fontStr(o.style, o.weight || 400, size, o.fam || SANS);
            g.textAlign = "left";
            g.textBaseline = "alphabetic";
            var words = s.split(" ");
            var line = "";
            for (var wi = 0; wi < words.length; wi++) {
              var probe = line ? line + " " + words[wi] : words[wi];
              if (g.measureText(probe).width > w && line) {
                g.fillText(line, x, y);
                y += lh;
                line = words[wi];
              } else {
                line = probe;
              }
            }
            if (line) {
              g.fillText(line, x, y);
              y += lh;
            }
            g.restore();
            return y;
          }
          function hr(x, y, w, color, lw) {
            g.strokeStyle = color || LINE;
            g.lineWidth = lw || 1.5;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + w, y);
            g.stroke();
          }
          function vr(x, y, h, color, lw) {
            g.strokeStyle = color || LINE;
            g.lineWidth = lw || 1.5;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x, y + h);
            g.stroke();
          }
          function rrPath(x, y, w, h, r) {
            g.beginPath();
            if (g.roundRect) {
              g.roundRect(x, y, w, h, r);
              return;
            }
            g.moveTo(x + r, y);
            g.arcTo(x + w, y, x + w, y + h, r);
            g.arcTo(x + w, y + h, x, y + h, r);
            g.arcTo(x, y + h, x, y, r);
            g.arcTo(x, y, x + w, y, r);
            g.closePath();
          }
          function btn(x, y, w, h, s, o) {
            o = o || {};
            rrPath(x, y, w, h, o.r == null ? h / 2 : o.r);
            if (o.outline) {
              g.strokeStyle = o.stroke || "#c6c6cd";
              g.lineWidth = 2;
              g.stroke();
            } else {
              g.fillStyle = o.bg || INK;
              g.fill();
            }
            txt(x + w / 2, y + h / 2 + 1, s, {
              align: "center",
              baseline: "middle",
              size: o.size || 16,
              weight: o.weight || 600,
              color: o.outline ? o.color || BODY : o.color || "#ffffff",
            });
          }
          function chip(x, y, s, o) {
            o = o || {};
            var size = o.size || 14;
            var h = o.h || 40;
            var w = measure(s, { size: size, weight: 600 }) + 32;
            rrPath(x, y, w, h, h / 2);
            g.fillStyle = o.bg || "#f1f1f4";
            g.fill();
            txt(x + w / 2, y + h / 2 + 1, s, {
              align: "center",
              baseline: "middle",
              size: size,
              weight: 600,
              color: o.color || "#46464c",
            });
            return w;
          }
          function avatar(x, y, r, initials, bg, ring) {
            if (ring) {
              g.strokeStyle = PAPER;
              g.lineWidth = 5;
              g.beginPath();
              g.arc(x, y, r + 2, 0, Math.PI * 2);
              g.stroke();
            }
            g.fillStyle = bg;
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
            txt(x, y + 1, initials, {
              align: "center",
              baseline: "middle",
              size: r * 0.82,
              weight: 700,
              color: "#ffffff",
            });
          }
          function field(x, y, w, label, value, o) {
            o = o || {};
            txt(x, y, label, { size: 13, weight: 600, color: SUB });
            if (o.req)
              txt(
                x + measure(label, { size: 13, weight: 600 }) + 5,
                y,
                "*",
                { size: 13, weight: 700, color: RED },
              );
            var boxY = y + 12;
            var boxH = 56;
            rrPath(x, boxY, w, boxH, 8);
            g.fillStyle = "#ffffff";
            g.fill();
            g.strokeStyle = "#c2c2cb";
            g.lineWidth = 1.6;
            g.stroke();
            txt(x + 16, boxY + boxH / 2 + 1, value, {
              size: 16.5,
              color: INK,
              baseline: "middle",
            });
            if (o.select) {
              g.fillStyle = SUB;
              g.beginPath();
              g.moveTo(x + w - 32, boxY + boxH / 2 - 4);
              g.lineTo(x + w - 18, boxY + boxH / 2 - 4);
              g.lineTo(x + w - 25, boxY + boxH / 2 + 6);
              g.closePath();
              g.fill();
            }
          }
          function radio(x, y, on, label) {
            g.strokeStyle = on ? BLUE : "#9d9da6";
            g.lineWidth = 2.4;
            g.beginPath();
            g.arc(x, y, 11, 0, Math.PI * 2);
            g.stroke();
            if (on) {
              g.fillStyle = BLUE;
              g.beginPath();
              g.arc(x, y, 5.5, 0, Math.PI * 2);
              g.fill();
            }
            txt(x + 24, y + 1, label, {
              size: 15.5,
              baseline: "middle",
              color: BODY,
            });
          }
          function checkbox(x, y, on, label, accent) {
            rrPath(x, y, 26, 26, 6);
            if (on) {
              g.fillStyle = accent || INDIGO;
              g.fill();
              txt(x + 13, y + 14, "✓", {
                align: "center",
                baseline: "middle",
                size: 16,
                weight: 700,
                color: "#ffffff",
              });
            } else {
              g.strokeStyle = "#b9b9c2";
              g.lineWidth = 2.2;
              g.stroke();
            }
            txt(x + 40, y + 14, label, {
              size: 15,
              baseline: "middle",
              color: BODY,
            });
          }
          function mailChrome(f, inboxText) {
            g.fillStyle = "#f0f0f2";
            g.fillRect(f.x, f.y, f.w, 54);
            hr(f.x, f.y + 54, f.w, "rgba(20,20,25,0.10)", 1.5);
            var dots = ["#ff5f57", "#febc2e", "#28c840"];
            for (var d = 0; d < 3; d++) {
              g.fillStyle = dots[d];
              g.beginPath();
              g.arc(f.x + 30 + d * 24, f.y + 27, 7, 0, Math.PI * 2);
              g.fill();
            }
            txt(f.x + f.w / 2, f.y + 28, inboxText, {
              align: "center",
              baseline: "middle",
              size: 12,
              weight: 600,
              fam: MONOF,
              color: FAINT,
              ls: 1.5,
            });
          }
          function fromRow(f, y, initials, avBg, name, addr, when, toLine) {
            avatar(f.x + 68, y, 24, initials, avBg);
            var nx = f.x + 106;
            txt(nx, y - 4, name, { size: 15.5, weight: 700 });
            txt(
              nx + measure(name, { size: 15.5, weight: 700 }) + 10,
              y - 4,
              addr,
              { size: 13, color: FAINT },
            );
            txt(f.x + f.w - 44, y - 4, when, {
              size: 12.5,
              color: FAINT,
              align: "right",
            });
            txt(nx, y + 18, toLine || "to me", { size: 12.5, color: FAINT });
          }
          function crease(f, t) {
            // faint tri-fold line, like a letter that came out of an envelope
            hr(f.x + 6, f.y + f.h * t, f.w - 12, "rgba(20,20,25,0.05)", 2);
            hr(f.x + 6, f.y + f.h * t + 2, f.w - 12, "rgba(255,255,255,0.5)", 1);
          }
          function stamp(cx, cy, big, small, color, ang) {
            g.save();
            g.translate(cx, cy);
            g.rotate(ang);
            g.globalAlpha = 0.82;
            var w = measure(big, { size: 34, weight: 800 }) + 90;
            var h = small ? 100 : 78;
            g.strokeStyle = color;
            g.lineWidth = 5;
            rrPath(-w / 2, -h / 2, w, h, 12);
            g.stroke();
            g.lineWidth = 2;
            rrPath(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 8);
            g.stroke();
            txt(0, small ? -10 : 1, big, {
              align: "center",
              baseline: "middle",
              size: 34,
              weight: 800,
              color: color,
              ls: 4,
            });
            if (small)
              txt(0, 28, small, {
                align: "center",
                baseline: "middle",
                size: 13,
                weight: 700,
                fam: MONOF,
                color: color,
                ls: 2,
              });
            g.restore();
          }

          var M = 56; // card inset inside cell (1024-space)

          function cardFrame() {
            var x = M,
              y = M,
              w = BASE - M * 2,
              h = BASE - M * 2;
            g.save();
            g.shadowColor = "rgba(30,30,30,0.10)";
            g.shadowBlur = 26 * K;
            g.shadowOffsetY = 6 * K;
            g.fillStyle = PAPER;
            g.fillRect(x, y, w, h);
            g.restore();
            g.strokeStyle = "rgba(20,20,20,0.08)";
            g.lineWidth = 2;
            g.strokeRect(x + 1, y + 1, w - 2, h - 2);
            return { x: x, y: y, w: w, h: h };
          }
          function indexTag(f, n) {
            g.save();
            g.translate(f.x + f.w - 24, f.y + f.h - 28);
            g.rotate(-Math.PI / 2);
            txt(0, 0, "DOC " + (n < 10 ? "0" : "") + n + "/24", {
              size: 20,
              weight: 600,
              fam: MONOF,
              color: "#a3a29c",
            });
            g.restore();
          }

          var draws = [
            // 01 - APM program posting (Northwind)
            function (f) {
              var x = f.x + 44,
                rx = f.x + f.w - 44,
                w = f.w - 88;
              rrPath(x, f.y + 40, 46, 46, 11);
              g.fillStyle = INDIGO;
              g.fill();
              txt(x + 23, f.y + 64, "N", {
                align: "center",
                baseline: "middle",
                size: 26,
                weight: 800,
                color: "#ffffff",
              });
              txt(x + 62, f.y + 72, "Northwind", { size: 22, weight: 700 });
              txt(rx, f.y + 71, "Early Careers", {
                size: 15,
                weight: 600,
                color: SUB,
                align: "right",
              });
              hr(x, f.y + 110, w);
              txt(x, f.y + 152, "PROGRAMS / PRODUCT / APM CLASS OF 2027", {
                size: 12.5,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 2,
              });
              txt(x, f.y + 208, "Associate Product Manager", {
                size: 41,
                weight: 800,
              });
              var chx = x;
              chx += chip(chx, f.y + 238, "New York, NY") + 14;
              chx += chip(chx, f.y + 238, "Full-Time") + 14;
              chip(chx, f.y + 238, "Class of 2027");
              btn(x, f.y + 308, 252, 56, "Apply to the program", {
                bg: INDIGO,
                r: 9,
                size: 16.5,
              });
              txt(x + 272, f.y + 337, "Closes October 1", {
                size: 13,
                color: FAINT,
                baseline: "middle",
              });
              var y = f.y + 428;
              txt(x, y, "About the program", { size: 19, weight: 700 });
              y += 32;
              y = wrap(
                x,
                y,
                w,
                "Northwind's APM program is a two-year rotational track across consumer, platform, and new bets. APMs own a product surface from day one, ship with senior mentorship, and rotate teams every eight months.",
                { size: 15, lh: 23 },
              );
              y += 28;
              txt(x, y, "What you'll own", { size: 19, weight: 700 });
              y += 32;
              var bullets = [
                "Roadmap and metrics for one product surface",
                "Weekly experiment reviews with your pod",
                "A capstone launch presented to the exec team",
                "Three rotations across the company in two years",
              ];
              for (var b = 0; b < bullets.length; b++) {
                txt(x + 4, y, "•", { size: 15, color: BODY });
                y = wrap(x + 26, y, w - 26, bullets[b], { size: 15, lh: 23 });
                y += 4;
              }
              txt(
                x,
                f.y + f.h - 40,
                "PROGRAM 2027 · POSTED JUL 2026 · 3,912 APPLICANTS",
                { size: 12.5, weight: 600, fam: MONOF, color: FAINT, ls: 1.5 },
              );
            },
            // 02 - resume: Jordan Reyes, software engineering intern
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120,
                cx = f.x + f.w / 2;
              txt(cx, f.y + 86, "JORDAN REYES", {
                align: "center",
                size: 40,
                weight: 700,
                fam: SERIF,
                ls: 3,
              });
              txt(
                cx,
                f.y + 120,
                "Los Angeles, CA · (213) 555-0148 · jordanreyes.dev@gmail.com · github.com/jreyesdev",
                { align: "center", size: 12.5, color: BODY },
              );
              function section(y, t) {
                txt(x, y, t, { size: 14.5, weight: 700, ls: 2 });
                hr(x, y + 10, w, "rgba(20,20,25,0.42)", 1.6);
                return y + 40;
              }
              function bullet(y, s) {
                txt(x + 6, y, "•", { size: 14 });
                return (
                  wrap(x + 26, y, w - 26, s, {
                    size: 13.8,
                    lh: 20,
                    color: BODY,
                  }) + 2
                );
              }
              var y = section(f.y + 174, "EDUCATION");
              txt(x, y, "University of Southern California", {
                size: 15,
                weight: 700,
              });
              txt(rx, y, "Los Angeles, CA", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 24;
              txt(x, y, "B.S. Computer Science, GPA 3.72", {
                size: 14.2,
                style: "italic",
                color: BODY,
              });
              txt(rx, y, "Expected May 2028", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y = section(y + 34, "EXPERIENCE");
              txt(x, y, "Software Engineering Intern", {
                size: 15,
                weight: 700,
              });
              txt(rx, y, "Jun 2026 – Aug 2026", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 22;
              txt(x, y, "Harbor Analytics, Santa Monica, CA", {
                size: 14,
                style: "italic",
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Built a real-time ETL pipeline (Python, Kafka) that cut dashboard refresh lag from 40 minutes to 90 seconds",
              );
              y = bullet(
                y,
                "Shipped a React reporting view used weekly by 300+ enterprise users, reducing support tickets 18%",
              );
              y = bullet(
                y,
                "Raised backend test coverage from 61% to 88% across 40+ endpoints",
              );
              y += 10;
              txt(x, y, "Web Developer", { size: 15, weight: 700 });
              txt(rx, y, "Sep 2025 – May 2026", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 22;
              txt(x, y, "USC Viterbi School of Engineering IT", {
                size: 14,
                style: "italic",
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Migrated six legacy department sites to Next.js, serving 12k monthly visitors",
              );
              y = bullet(
                y,
                "Automated weekly analytics reporting with Python, saving staff five hours per week",
              );
              y = section(y + 24, "PROJECTS");
              txt(x, y, "Transit Lens", { size: 15, weight: 700 });
              txt(rx, y, "SwiftUI · Node.js", {
                size: 13,
                align: "right",
                fam: MONOF,
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Open-source LA Metro arrivals app; 1.2k GitHub stars and about 4k monthly riders",
              );
              y = section(y + 24, "SKILLS");
              y = wrap(
                x,
                y,
                w,
                "Python, TypeScript, Go, Swift, SQL · React, Node.js, PostgreSQL, Kafka, AWS, Docker, Git",
                { size: 14, lh: 21, color: BODY },
              );
              y = section(y + 20, "ACTIVITIES");
              wrap(
                x,
                y,
                w,
                "USC Hack Night organizer · ACM member · marathon runner",
                { size: 14, lh: 21, color: BODY },
              );
            },
            // 03 - auto-ack email: Bluepeak received Priya's application
            function (f) {
              mailChrome(f, "INBOX · 2,318 UNREAD");
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 150, "Your application to Bluepeak", {
                size: 27,
                weight: 700,
              });
              fromRow(
                f,
                f.y + 216,
                "B",
                TEAL,
                "Bluepeak Careers",
                "<no-reply@bluepeak.ae>",
                "Jul 28, 2:12 PM",
              );
              var y = f.y + 300;
              txt(x, y, "Hi Priya,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "Thank you for applying to the Data Analyst role at Bluepeak. Our talent team screens every application and will contact you about next steps within two weeks.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "You can track your status any time from your candidate home.",
                { size: 15.5, lh: 24 },
              );
              var by = y + 24;
              rrPath(x, by, w, 150, 12);
              g.fillStyle = "#f6f6f8";
              g.fill();
              txt(x + 28, by + 46, "APPLICATION   BP-88214", {
                size: 14,
                weight: 600,
                fam: MONOF,
                color: BODY,
              });
              txt(x + 28, by + 84, "POSITION      Data Analyst · Dubai HQ", {
                size: 14,
                weight: 600,
                fam: MONOF,
                color: BODY,
              });
              txt(x + 28, by + 122, "SUBMITTED     Jul 28, 2026 · 2:11 PM GST", {
                size: 14,
                weight: 600,
                fam: MONOF,
                color: BODY,
              });
              btn(x, by + 190, 120, 48, "Reply", {
                outline: true,
                r: 24,
                size: 14.5,
              });
              btn(x + 136, by + 190, 140, 48, "Forward", {
                outline: true,
                r: 24,
                size: 14.5,
              });
              txt(
                x,
                f.y + f.h - 40,
                "This is an automated message. Please do not reply to this email.",
                { size: 12, color: FAINT },
              );
            },
            // 04 - career expo flyer
            function (f) {
              var cx = f.x + f.w / 2;
              txt(cx, f.y + 130, "THE CAMPUS CAREER CENTER PRESENTS", {
                align: "center",
                size: 13,
                weight: 700,
                fam: MONOF,
                color: SUB,
                ls: 4,
              });
              txt(cx, f.y + 260, "FALL CAREER", {
                align: "center",
                size: 84,
                weight: 800,
                ls: 2,
              });
              g.save();
              g.translate(cx, f.y + 352);
              g.rotate(-0.012);
              g.fillStyle = ORANGE;
              g.fillRect(-330, -58, 660, 78);
              g.restore();
              txt(cx, f.y + 372, "EXPO 2026", {
                align: "center",
                size: 84,
                weight: 800,
                color: "#ffffff",
                ls: 2,
              });
              txt(cx, f.y + 470, "Thursday, September 18 · 10 AM – 4 PM", {
                align: "center",
                size: 21,
                weight: 700,
              });
              txt(cx, f.y + 504, "Pavilion Hall A · South Campus", {
                align: "center",
                size: 16,
                color: SUB,
              });
              hr(cx - 180, f.y + 560, 360, "rgba(20,20,25,0.35)", 2);
              txt(cx, f.y + 700, "120+", {
                align: "center",
                size: 110,
                weight: 800,
                color: ORANGE,
              });
              txt(cx, f.y + 744, "EMPLOYERS HIRING INTERNS & NEW GRADS", {
                align: "center",
                size: 14,
                weight: 700,
                ls: 3,
                color: BODY,
              });
              txt(
                cx,
                f.y + f.h - 44,
                "BRING RESUMES · BUSINESS CASUAL · STUDENT ID REQUIRED",
                {
                  align: "center",
                  size: 12,
                  weight: 600,
                  fam: MONOF,
                  color: FAINT,
                  ls: 2,
                },
              );
            },
            // 05 - portal form: Priya Nair, full-time data analyst
            function (f) {
              var x = f.x + 44,
                rx = f.x + f.w - 44,
                w = f.w - 88;
              g.fillStyle = TEAL;
              g.fillRect(f.x, f.y, f.w, 84);
              g.strokeStyle = "rgba(255,255,255,0.9)";
              g.lineWidth = 3;
              g.beginPath();
              g.arc(x + 14, f.y + 42, 13, 0, Math.PI * 2);
              g.stroke();
              txt(x + 40, f.y + 49, "bluepeak", {
                size: 19,
                weight: 600,
                color: "#ffffff",
              });
              txt(rx, f.y + 48, "Candidate Home · Sign Out", {
                size: 12.5,
                color: "rgba(255,255,255,0.85)",
                align: "right",
              });
              var steps = [
                "My Information",
                "My Experience",
                "Questions",
                "Review",
              ];
              var sy = f.y + 144;
              for (var s = 0; s < 4; s++) {
                var sx = f.x + f.w * (0.14 + 0.24 * s);
                if (s < 3) {
                  hr(sx + 22, sy, f.w * 0.24 - 44, "#d4d4da", 2.5);
                }
                g.beginPath();
                g.arc(sx, sy, 18, 0, Math.PI * 2);
                if (s === 0) {
                  g.fillStyle = TEAL;
                  g.fill();
                } else {
                  g.fillStyle = "#ffffff";
                  g.fill();
                  g.strokeStyle = "#c2c2cb";
                  g.lineWidth = 2;
                  g.stroke();
                }
                txt(sx, sy + 1, String(s + 1), {
                  align: "center",
                  baseline: "middle",
                  size: 15,
                  weight: 700,
                  color: s === 0 ? "#ffffff" : SUB,
                });
                txt(sx, sy + 44, steps[s], {
                  align: "center",
                  size: 11.5,
                  weight: s === 0 ? 700 : 500,
                  color: s === 0 ? INK : SUB,
                });
              }
              txt(x, f.y + 254, "My Information", { size: 27, weight: 700 });
              txt(
                x,
                f.y + 286,
                "Applying for: Data Analyst · Full-Time · REQ-0921",
                { size: 13, weight: 600, color: SUB },
              );
              var colW = (w - 44) / 2;
              var x2 = x + colW + 44;
              field(x, f.y + 312, colW, "First Name", "Priya", { req: true });
              field(x2, f.y + 312, colW, "Last Name", "Nair", { req: true });
              field(
                x,
                f.y + 408,
                colW,
                "Email Address",
                "priya.nair.data@gmail.com",
                { req: true },
              );
              field(x2, f.y + 408, colW, "Phone", "+971 50 555 0134", {
                req: true,
              });
              field(x, f.y + 504, colW, "Country", "United Arab Emirates", {
                req: true,
                select: true,
              });
              field(
                x2,
                f.y + 504,
                colW,
                "How Did You Hear About Us?",
                "LinkedIn",
                { select: true },
              );
              g.setLineDash([9, 7]);
              rrPath(x, f.y + 598, w, 92, 10);
              g.strokeStyle = "#b9b9c2";
              g.lineWidth = 2;
              g.stroke();
              g.setLineDash([]);
              g.fillStyle = "#ffffff";
              g.strokeStyle = "#9d9da6";
              g.lineWidth = 2;
              g.fillRect(x + 26, f.y + 618, 40, 52);
              g.strokeRect(x + 26, f.y + 618, 40, 52);
              g.fillStyle = "#e8e8ec";
              g.beginPath();
              g.moveTo(x + 66, f.y + 618);
              g.lineTo(x + 54, f.y + 618);
              g.lineTo(x + 66, f.y + 630);
              g.closePath();
              g.fill();
              for (var l = 0; l < 4; l++) {
                hr(x + 33, f.y + 638 + l * 8, 26, "#c9c9cf", 2);
              }
              txt(x + 88, f.y + 640, "Priya_Nair_Resume.pdf", {
                size: 15.5,
                weight: 600,
              });
              txt(x + 88, f.y + 664, "212 KB · Uploaded ✓", {
                size: 12.5,
                weight: 600,
                color: GREEN,
              });
              txt(rx - 8, f.y + 648, "Replace", {
                size: 13.5,
                weight: 600,
                color: TEAL,
                align: "right",
              });
              txt(x, f.y + 730, "Are you open to relocating for this role?", {
                size: 14.5,
                weight: 600,
                color: BODY,
              });
              txt(
                x +
                  measure("Are you open to relocating for this role?", {
                    size: 14.5,
                    weight: 600,
                  }) +
                  5,
                f.y + 730,
                "*",
                { size: 14.5, weight: 700, color: RED },
              );
              radio(x + 12, f.y + 766, true, "Yes");
              radio(x + 130, f.y + 766, false, "No");
              btn(x, f.y + 814, 120, 54, "Back", {
                outline: true,
                r: 8,
                size: 15.5,
              });
              btn(rx - 240, f.y + 814, 240, 54, "Save and Continue", {
                bg: TEAL,
                r: 8,
                size: 15.5,
              });
            },
            // 06 - resume: Amara Osei, product / APM track
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120;
              txt(x, f.y + 96, "Amara Osei", { size: 38, weight: 800 });
              txt(rx, f.y + 74, "New York, NY · (917) 555-0173", {
                size: 12.5,
                color: BODY,
                align: "right",
              });
              txt(
                rx,
                f.y + 96,
                "amara.osei@umich.edu · linkedin.com/in/amaraosei",
                { size: 12.5, color: BODY, align: "right" },
              );
              hr(x, f.y + 122, w, "rgba(20,20,25,0.42)", 1.6);
              function section(y, t) {
                txt(x, y, t, { size: 14.5, weight: 700, ls: 2 });
                hr(x, y + 10, w, "rgba(20,20,25,0.42)", 1.6);
                return y + 40;
              }
              function bullet(y, s) {
                txt(x + 6, y, "•", { size: 14 });
                return (
                  wrap(x + 26, y, w - 26, s, {
                    size: 13.8,
                    lh: 20,
                    color: BODY,
                  }) + 2
                );
              }
              var y = section(f.y + 172, "EDUCATION");
              txt(x, y, "University of Michigan, Ross School of Business", {
                size: 15,
                weight: 700,
              });
              txt(rx, y, "Ann Arbor, MI", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 24;
              txt(x, y, "B.B.A., Minor in Computer Science · GPA 3.81", {
                size: 14.2,
                style: "italic",
                color: BODY,
              });
              txt(rx, y, "May 2027", { size: 14, align: "right", color: BODY });
              y = section(y + 34, "PRODUCT EXPERIENCE");
              txt(x, y, "Product Management Intern", { size: 15, weight: 700 });
              txt(rx, y, "Loopcart · Summer 2026", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 24;
              y = bullet(
                y,
                "Shipped a cart-abandonment nudge tested on 1.2M sessions, lifting checkout conversion 4.1%",
              );
              y = bullet(
                y,
                "Wrote the PRD and ran weekly standups for a six-engineer pod",
              );
              y = bullet(
                y,
                "Cut onboarding drop-off 22% after 14 user interviews and a first-run rewrite",
              );
              y += 10;
              txt(x, y, "Product Analyst Intern", { size: 15, weight: 700 });
              txt(rx, y, "Civic Metrics · Summer 2025", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 24;
              y = bullet(
                y,
                "Built the KPI tree for the city-dashboards product and defined nine north-star inputs",
              );
              y = bullet(
                y,
                "Prototyped in Figma; three concepts were adopted into the 2026 roadmap",
              );
              y = section(y + 24, "LEADERSHIP");
              y = bullet(
                y,
                "President, Michigan Product Club: grew membership from 40 to 260, ran two case competitions",
              );
              y = bullet(
                y,
                "2nd place, MHacks: voice agent for low-vision grocery shopping",
              );
              y = section(y + 24, "SKILLS");
              wrap(
                x,
                y,
                w,
                "SQL, Figma, Amplitude, A/B testing, user research · conversational Python",
                { size: 14, lh: 21, color: BODY },
              );
            },
            // 07 - online assessment invite
            function (f) {
              var x = f.x + 44,
                w = f.w - 88;
              avatar(x + 22, f.y + 96, 22, "V", "#3f3f46");
              txt(x + 60, f.y + 92, "Vantage Systems · Assessments", {
                size: 15,
                weight: 600,
                color: BODY,
              });
              txt(x + 60, f.y + 114, "proctored online exam", {
                size: 12,
                color: FAINT,
              });
              hr(x, f.y + 150, w);
              txt(x, f.y + 226, "Online Assessment", { size: 34, weight: 800 });
              txt(
                x,
                f.y + 262,
                "Software Engineer Intern · Fall 2026 pipeline",
                { size: 15, color: SUB },
              );
              var by = f.y + 300;
              rrPath(x, by, w, 186, 12);
              g.fillStyle = "#f6f6f8";
              g.fill();
              var rowsA = [
                "DURATION    90 MINUTES",
                "SECTIONS    3 CODING · 1 SQL",
                "DEADLINE    AUG 5, 11:59 PM PT",
                "ATTEMPTS    ONE",
              ];
              for (var r = 0; r < rowsA.length; r++) {
                txt(x + 28, by + 48 + r * 38, rowsA[r], {
                  size: 14,
                  weight: 600,
                  fam: MONOF,
                  color: BODY,
                });
              }
              btn(x, f.y + 530, 260, 56, "Start assessment", {
                bg: ORANGE,
                r: 9,
                size: 16.5,
              });
              txt(x + 280, f.y + 559, "or resume a saved session", {
                size: 13,
                color: FAINT,
                baseline: "middle",
              });
              var y2 = f.y + 650;
              y2 = wrap(
                x,
                y2,
                w,
                "Any language is allowed. A working webcam is required for proctoring. Practice questions are available in your dashboard until you begin.",
                { size: 14, lh: 22, color: BODY },
              );
              txt(x, f.y + f.h - 40, "POWERED BY CODEGATE · ID VX-2026-3319", {
                size: 12.5,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 1.5,
              });
            },
            // 08 - cover letter: Leo Tanaka, IB summer analyst
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 64,
                w = f.w - 128,
                cx = f.x + f.w / 2;
              txt(cx, f.y + 78, "LEO TANAKA", {
                align: "center",
                size: 24,
                weight: 400,
                fam: SERIF,
                ls: 7,
              });
              txt(
                cx,
                f.y + 108,
                "New Haven, CT · leo.tanaka@yale.edu · (203) 555-0117",
                { align: "center", size: 12, color: SUB },
              );
              hr(cx - 130, f.y + 130, 260, "rgba(20,20,25,0.35)", 1.6);
              var y = f.y + 186;
              txt(x, y, "August 30, 2026", {
                size: 15,
                fam: SERIF,
                color: BODY,
              });
              y += 42;
              var rcpt = [
                "Recruiting Team",
                "Halston & Cross",
                "200 Vesey Street",
                "New York, NY 10281",
              ];
              for (var r = 0; r < rcpt.length; r++) {
                txt(x, y, rcpt[r], { size: 14.5, fam: SERIF, color: BODY });
                y += 23;
              }
              y += 24;
              txt(x, y, "Dear Recruiting Team,", {
                size: 15.5,
                fam: SERIF,
                color: INK,
              });
              y += 32;
              y = wrap(
                x,
                y,
                w,
                "I am writing to apply for the Summer Analyst position in your Consumer & Retail group. I am a junior studying economics at Yale, and I have spent the past two years building models and pitching stocks for our student fund.",
                { size: 15, lh: 24, fam: SERIF },
              );
              y += 12;
              y = wrap(
                x,
                y,
                w,
                "This summer at Marlowe & Kent I built three-statement and DCF models across two live sell-side processes and drafted CIM pages that went in front of buyers. I learned to love the pace: tight turns, clean numbers, no surprises.",
                { size: 15, lh: 24, fam: SERIF },
              );
              y += 12;
              y = wrap(
                x,
                y,
                w,
                "Halston's consumer franchise is where I want to learn the craft. I would welcome the chance to interview. Thank you for your consideration.",
                { size: 15, lh: 24, fam: SERIF },
              );
              y += 26;
              txt(x, y, "Sincerely,", { size: 15.5, fam: SERIF, color: INK });
              txt(x + 8, y + 58, "Leo Tanaka", {
                size: 42,
                style: "italic",
                fam: SCRIPT,
                color: "#1c1c30",
              });
              txt(x, y + 92, "Leo Tanaka", {
                size: 14.5,
                fam: SERIF,
                color: BODY,
              });
            },
            // 09 - "application sent" confirmation card
            function (f) {
              var cx = f.x + f.w / 2;
              rrPath(f.x + 44, f.y + 44, 44, 44, 9);
              g.fillStyle = LNKD;
              g.fill();
              txt(f.x + 66, f.y + 68, "in", {
                align: "center",
                baseline: "middle",
                size: 24,
                weight: 800,
                color: "#ffffff",
              });
              txt(f.x + f.w - 44, f.y + 74, "···", {
                size: 22,
                weight: 700,
                color: FAINT,
                align: "right",
              });
              g.strokeStyle = GREEN;
              g.lineWidth = 7;
              g.beginPath();
              g.arc(cx, f.y + 268, 62, 0, Math.PI * 2);
              g.stroke();
              txt(cx, f.y + 272, "✓", {
                align: "center",
                baseline: "middle",
                size: 62,
                weight: 700,
                color: GREEN,
              });
              wrap(
                f.x + 160,
                f.y + 420,
                f.w - 320,
                "Your application was sent to Crestline Partners",
                { size: 26, weight: 700, lh: 36, color: INK },
              );
              txt(cx, f.y + 508, "Strategy Analyst · New York, NY · Hybrid", {
                align: "center",
                size: 15,
                color: SUB,
              });
              hr(f.x + 140, f.y + 560, f.w - 280);
              txt(cx, f.y + 606, "Applied just now · Your resume was included", {
                align: "center",
                size: 13.5,
                color: FAINT,
              });
              btn(cx - 110, f.y + 650, 220, 52, "View application", {
                outline: true,
                stroke: LNKD,
                color: LNKD,
                r: 26,
                size: 15,
              });
              wrap(
                f.x + 120,
                f.y + 780,
                f.w - 240,
                "The hiring team at Crestline Partners typically reviews applications within 2 weeks. We will notify you of any updates.",
                { size: 13, lh: 20, color: FAINT },
              );
            },
            // 10 - resume: Marcus Bell, growth marketing, full-time
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120,
                cx = f.x + f.w / 2;
              txt(cx, f.y + 84, "MARCUS BELL", {
                align: "center",
                size: 34,
                weight: 700,
                ls: 5,
              });
              txt(
                cx,
                f.y + 114,
                "Growth Marketing · Austin, TX · marcus.bell@hey.com · (512) 555-0192",
                { align: "center", size: 12.5, color: BODY },
              );
              txt(
                cx,
                f.y + 142,
                "Performance marketer with two years scaling paid social and lifecycle for consumer apps.",
                { align: "center", size: 13, style: "italic", color: SUB },
              );
              function section(y, t) {
                txt(x, y, t, { size: 14.5, weight: 700, ls: 2 });
                hr(x, y + 10, w, "rgba(20,20,25,0.42)", 1.6);
                return y + 40;
              }
              function bullet(y, s) {
                txt(x + 6, y, "•", { size: 14 });
                return (
                  wrap(x + 26, y, w - 26, s, {
                    size: 13.8,
                    lh: 20,
                    color: BODY,
                  }) + 2
                );
              }
              var y = section(f.y + 192, "EXPERIENCE");
              txt(x, y, "Growth Marketing Analyst", { size: 15, weight: 700 });
              txt(rx, y, "2024 – 2026", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 22;
              txt(x, y, "Ember Fitness, Austin, TX", {
                size: 14,
                style: "italic",
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Scaled paid TikTok and Meta from $40k to $220k monthly at a 2.3x blended ROAS",
              );
              y = bullet(
                y,
                "Built lifecycle flows in Braze that lifted day-30 retention 9%",
              );
              y = bullet(
                y,
                "Ran 31 creative tests per quarter; UGC hooks cut acquisition cost 28%",
              );
              y += 10;
              txt(x, y, "Marketing Coordinator", { size: 15, weight: 700 });
              txt(rx, y, "2023 – 2024", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 22;
              txt(x, y, "Bright & Co. Agency, Dallas, TX", {
                size: 14,
                style: "italic",
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Managed six client content calendars, growing combined Instagram reach from 3.1M to 7.4M",
              );
              y = bullet(y, "Owned GA4 and Looker reporting for 11 accounts");
              y = section(y + 24, "EDUCATION");
              txt(x, y, "The University of Texas at Austin", {
                size: 15,
                weight: 700,
              });
              txt(rx, y, "Austin, TX", {
                size: 14,
                align: "right",
                color: BODY,
              });
              y += 24;
              txt(x, y, "B.S. Advertising", {
                size: 14.2,
                style: "italic",
                color: BODY,
              });
              txt(rx, y, "May 2023", { size: 14, align: "right", color: BODY });
              y = section(y + 34, "SKILLS");
              wrap(
                x,
                y,
                w,
                "Meta Ads, TikTok Ads, Braze, GA4, Looker, Figma, SQL basics",
                { size: 14, lh: 21, color: BODY },
              );
            },
            // 11 - phone screen scheduler
            function (f) {
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 128, "Schedule your phone screen", {
                size: 27,
                weight: 700,
              });
              fromRow(
                f,
                f.y + 192,
                "R",
                GREEN,
                "Ridgeline Recruiting",
                "<talent@ridgeline.dev>",
                "Aug 6, 10:12 AM",
              );
              var y = f.y + 274;
              txt(x, y, "Hi Jordan,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "Great news: the team would love to speak with you about the Software Engineer Intern role. Pick a time that works:",
                { size: 15.5, lh: 24 },
              );
              var slots = [
                ["Tue, Aug 11 · 10:00 AM PT", false],
                ["Tue, Aug 11 · 3:30 PM PT", true],
                ["Wed, Aug 12 · 1:00 PM PT", false],
              ];
              var sy = y + 26;
              for (var s = 0; s < slots.length; s++) {
                var yy = sy + s * 72;
                rrPath(x, yy, 380, 56, 12);
                if (slots[s][1]) {
                  g.fillStyle = GREEN;
                  g.fill();
                } else {
                  g.strokeStyle = "#c2c2cb";
                  g.lineWidth = 2;
                  g.stroke();
                }
                txt(x + 26, yy + 29, slots[s][0], {
                  size: 15,
                  weight: 600,
                  baseline: "middle",
                  color: slots[s][1] ? "#ffffff" : BODY,
                });
                if (slots[s][1])
                  txt(x + 344, yy + 29, "✓", {
                    size: 17,
                    weight: 700,
                    baseline: "middle",
                    color: "#ffffff",
                    align: "right",
                  });
              }
              btn(x, sy + 246, 210, 54, "Confirm time", {
                bg: GREEN,
                r: 9,
                size: 15.5,
              });
              txt(
                x,
                f.y + f.h - 40,
                "30 minutes · Zoom · with Maya Chen, Head of Engineering",
                { size: 12.5, color: FAINT },
              );
            },
            // 12 - the rejection. everyone has printed this one.
            function (f) {
              mailChrome(f, "INBOX · 1,207 UNREAD");
              var x = f.x + 44,
                w = f.w - 88;
              txt(
                x,
                f.y + 150,
                "Update on your application to Vantage Systems",
                { size: 24, weight: 700 },
              );
              fromRow(
                f,
                f.y + 216,
                "V",
                "#6b7280",
                "Vantage Systems Talent",
                "<careers@vantagesys.com>",
                "Aug 2, 9:03 AM",
              );
              var y = f.y + 300;
              txt(x, y, "Hi Marcus,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "Thank you for your interest in the Growth Marketing Associate role, and for the time you put into the interview process.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "After careful consideration, we have decided to move forward with other candidates whose experience more closely matches the needs of the team at this time.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "This was a competitive cycle, and we would be glad to see you apply again next season. We will keep your resume on file.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              txt(x, y, "Best wishes,", { size: 15.5, color: BODY });
              y += 24;
              txt(x, y, "The Vantage Systems Talent Team", {
                size: 15.5,
                color: BODY,
              });
              txt(
                x,
                f.y + f.h - 40,
                "Sent by an automated system on behalf of Vantage Systems Recruiting.",
                { size: 12, color: FAINT },
              );
            },
            // 13 - job posting: full-time data analyst (Bluepeak, Dubai)
            function (f) {
              var x = f.x + 44,
                rx = f.x + f.w - 44,
                w = f.w - 88;
              g.strokeStyle = TEAL;
              g.lineWidth = 5;
              g.beginPath();
              g.arc(x + 23, f.y + 63, 20, 0, Math.PI * 2);
              g.stroke();
              txt(x + 62, f.y + 72, "bluepeak", { size: 22, weight: 700 });
              txt(rx, f.y + 71, "Careers", {
                size: 15,
                weight: 600,
                color: SUB,
                align: "right",
              });
              hr(x, f.y + 110, w);
              txt(x, f.y + 152, "CAREERS / DATA & ANALYTICS / FULL-TIME", {
                size: 12.5,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 2,
              });
              txt(x, f.y + 208, "Data Analyst", { size: 41, weight: 800 });
              var chx = x;
              chx += chip(chx, f.y + 238, "Dubai, UAE") + 14;
              chx += chip(chx, f.y + 238, "Full-Time") + 14;
              chip(chx, f.y + 238, "Visa sponsored");
              btn(x, f.y + 308, 236, 56, "Apply for this job", {
                bg: TEAL,
                r: 9,
                size: 16.5,
              });
              txt(x + 256, f.y + 337, "Posted 5 days ago", {
                size: 13,
                color: FAINT,
                baseline: "middle",
              });
              var y = f.y + 428;
              txt(x, y, "About the role", { size: 19, weight: 700 });
              y += 32;
              y = wrap(
                x,
                y,
                w,
                "Bluepeak runs logistics analytics for Gulf retail groups. You will own the dashboards our exec team reads every Monday morning, and the pipelines behind them.",
                { size: 15, lh: 23 },
              );
              y += 28;
              txt(x, y, "What you'll do", { size: 19, weight: 700 });
              y += 32;
              var bullets = [
                "Model demand and delivery data in SQL and dbt",
                "Ship exec dashboards and weekly forecast readouts",
                "Partner with ops leads across four cities",
                "Present monthly accuracy reviews",
              ];
              for (var b = 0; b < bullets.length; b++) {
                txt(x + 4, y, "•", { size: 15, color: BODY });
                y = wrap(x + 26, y, w - 26, bullets[b], { size: 15, lh: 23 });
                y += 4;
              }
              txt(
                x,
                f.y + f.h - 40,
                "REQ-0921 · AED 18,000 – 22,000 / MONTH · 640 APPLICANTS",
                { size: 12.5, weight: 600, fam: MONOF, color: FAINT, ls: 1.5 },
              );
            },
            // 14 - resume: Leo Tanaka, finance
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120,
                cx = f.x + f.w / 2;
              txt(cx, f.y + 84, "LEO TANAKA", {
                align: "center",
                size: 36,
                weight: 700,
                fam: SERIF,
                ls: 4,
              });
              txt(
                cx,
                f.y + 116,
                "New Haven, CT · leo.tanaka@yale.edu · (203) 555-0117",
                { align: "center", size: 12.5, color: BODY },
              );
              function section(y, t) {
                txt(x, y, t, { size: 14.5, weight: 700, fam: SERIF, ls: 2 });
                hr(x, y + 10, w, "rgba(20,20,25,0.42)", 1.6);
                return y + 40;
              }
              function bullet(y, s) {
                txt(x + 6, y, "•", { size: 14 });
                return (
                  wrap(x + 26, y, w - 26, s, {
                    size: 13.8,
                    lh: 20,
                    fam: SERIF,
                    color: BODY,
                  }) + 2
                );
              }
              var y = section(f.y + 168, "EDUCATION");
              txt(x, y, "Yale University", { size: 15, weight: 700, fam: SERIF });
              txt(rx, y, "New Haven, CT", {
                size: 14,
                align: "right",
                color: BODY,
                fam: SERIF,
              });
              y += 24;
              txt(x, y, "B.A. Economics · GPA 3.91", {
                size: 14.2,
                style: "italic",
                fam: SERIF,
                color: BODY,
              });
              txt(rx, y, "May 2028", {
                size: 14,
                align: "right",
                color: BODY,
                fam: SERIF,
              });
              y += 22;
              txt(
                x,
                y,
                "Coursework: Corporate Finance, Econometrics, Financial Accounting",
                { size: 13, style: "italic", fam: SERIF, color: SUB },
              );
              y = section(y + 32, "EXPERIENCE");
              txt(x, y, "Investment Banking Summer Analyst", {
                size: 15,
                weight: 700,
                fam: SERIF,
              });
              txt(rx, y, "Jun 2026 – Aug 2026", {
                size: 14,
                align: "right",
                color: BODY,
                fam: SERIF,
              });
              y += 22;
              txt(x, y, "Marlowe & Kent, New York, NY", {
                size: 14,
                style: "italic",
                fam: SERIF,
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Built three-statement and DCF models for two consumer deals ($40M – $120M enterprise value)",
              );
              y = bullet(
                y,
                "Drafted CIM sections and management presentation pages for a live sell-side process",
              );
              y += 10;
              txt(x, y, "Portfolio Analyst, Yale Investment Group", {
                size: 15,
                weight: 700,
                fam: SERIF,
              });
              txt(rx, y, "2024 – Present", {
                size: 14,
                align: "right",
                color: BODY,
                fam: SERIF,
              });
              y += 24;
              y = bullet(
                y,
                "Cover industrials; pitched a long thesis that returned 22% over eight months",
              );
              y = bullet(
                y,
                "Run weekly valuation workshops for 30 new members",
              );
              y = section(y + 24, "LEADERSHIP");
              y = bullet(
                y,
                "Treasurer, Yale Club Tennis · Peer tutor, introductory economics",
              );
              y = section(y + 24, "SKILLS");
              wrap(
                x,
                y,
                w,
                "Excel, PowerPoint, FactSet, Capital IQ · CFA Level I candidate (Feb 2027)",
                { size: 14, lh: 21, fam: SERIF, color: BODY },
              );
            },
            // 15 - recruiter outreach message
            function (f) {
              g.fillStyle = "#f0f0f2";
              g.fillRect(f.x, f.y, f.w, 54);
              hr(f.x, f.y + 54, f.w, "rgba(20,20,25,0.10)", 1.5);
              rrPath(f.x + 22, f.y + 14, 26, 26, 6);
              g.fillStyle = LNKD;
              g.fill();
              txt(f.x + 35, f.y + 28, "in", {
                align: "center",
                baseline: "middle",
                size: 14,
                weight: 800,
                color: "#ffffff",
              });
              txt(f.x + 60, f.y + 28, "Messaging", {
                size: 13,
                weight: 600,
                baseline: "middle",
                color: BODY,
              });
              var x = f.x + 44,
                w = f.w - 88;
              avatar(x + 26, f.y + 136, 26, "SW", SLATE);
              txt(x + 68, f.y + 130, "Sam Whitfield", { size: 16, weight: 700 });
              txt(x + 68, f.y + 154, "Technical Recruiter · TalentBridge", {
                size: 13,
                color: SUB,
              });
              txt(f.x + f.w - 44, f.y + 132, "2:41 PM", {
                size: 12.5,
                color: FAINT,
                align: "right",
              });
              var y = f.y + 226;
              y = wrap(
                x,
                y,
                w,
                "Hi Jordan, your Transit Lens project caught my eye. 1.2k stars is no joke.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "I'm hiring a founding full-stack engineer for a Series B fintech in Santa Monica. Base up to $185k plus meaningful equity, a team of nine, shipping weekly.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(x, y, w, "Open to a 15-minute chat this week?", {
                size: 15.5,
                lh: 24,
              });
              var cy = y + 30;
              btn(x, cy, 170, 50, "Interested", { bg: LNKD, r: 25, size: 14.5 });
              btn(x + 186, cy, 140, 50, "Not now", {
                outline: true,
                r: 25,
                size: 14.5,
              });
              btn(x + 342, cy, 180, 50, "Tell me more", {
                outline: true,
                r: 25,
                size: 14.5,
              });
              txt(
                x,
                f.y + f.h - 40,
                "InMail · Sam is a verified recruiter at TalentBridge",
                { size: 12, color: FAINT },
              );
            },
            // 16 - final round interview invite
            function (f) {
              g.fillStyle = GBLUE;
              g.fillRect(f.x, f.y, 12, f.h);
              var x = f.x + 56,
                w = f.w - 112;
              txt(x, f.y + 96, "SEP", {
                size: 14,
                weight: 700,
                fam: MONOF,
                color: RED,
                ls: 3,
              });
              txt(x, f.y + 152, "4", { size: 56, weight: 800 });
              var tx = f.x + 210;
              var ty = wrap(
                tx,
                f.y + 104,
                f.w - 260,
                "Final Round: Amara Osei × Northwind APM",
                { size: 23, weight: 700, lh: 32, color: INK },
              );
              txt(tx, ty + 8, "Friday, September 4 · 2:00 – 3:30 PM EDT", {
                size: 15,
                color: SUB,
              });
              hr(x, f.y + 250, w);
              btn(x, f.y + 292, 244, 54, "Join with video call", {
                bg: GBLUE,
                r: 10,
                size: 16,
              });
              txt(x, f.y + 388, "meet.northwind.co/apm-final", {
                size: 12.5,
                fam: MONOF,
                color: SUB,
              });
              txt(x, f.y + 448, "3 guests · 2 yes, 1 awaiting", {
                size: 14,
                weight: 600,
                color: BODY,
              });
              avatar(x + 22, f.y + 496, 22, "GL", "#7c3aed", true);
              avatar(x + 56, f.y + 496, 22, "TR", "#0f766e", true);
              avatar(x + 90, f.y + 496, 22, "AO", "#b45309", true);
              txt(x + 132, f.y + 480, "Grace Lin · APM Program Lead", {
                size: 13.5,
                color: BODY,
              });
              txt(x + 132, f.y + 502, "Tomás Rivera · Group PM", {
                size: 13.5,
                color: BODY,
              });
              txt(x + 132, f.y + 524, "Amara Osei · You", {
                size: 13.5,
                color: BODY,
              });
              rrPath(x, f.y + 568, w, 124, 12);
              g.fillStyle = "#f6f6f8";
              g.fill();
              wrap(
                x + 24,
                f.y + 608,
                w - 48,
                "Format: product sense case (40 min), metrics deep dive (30 min), then your questions (20 min). Bring one product you love and one you would fix.",
                { size: 14, lh: 22 },
              );
              txt(x, f.y + 758, "Going?", { size: 15, weight: 600 });
              btn(x + 84, f.y + 728, 96, 46, "Yes", {
                bg: GBLUE,
                r: 23,
                size: 14.5,
              });
              btn(x + 194, f.y + 728, 96, 46, "No", {
                outline: true,
                r: 23,
                size: 14.5,
              });
              btn(x + 304, f.y + 728, 120, 46, "Maybe", {
                outline: true,
                r: 23,
                size: 14.5,
              });
            },
            // 17 - the tracker spreadsheet
            function (f) {
              g.fillStyle = "#f0f0f2";
              g.fillRect(f.x, f.y, f.w, 54);
              hr(f.x, f.y + 54, f.w, "rgba(20,20,25,0.10)", 1.5);
              var dots = ["#ff5f57", "#febc2e", "#28c840"];
              for (var d = 0; d < 3; d++) {
                g.fillStyle = dots[d];
                g.beginPath();
                g.arc(f.x + 30 + d * 24, f.y + 27, 7, 0, Math.PI * 2);
                g.fill();
              }
              txt(f.x + f.w / 2, f.y + 28, "APPLICATIONS-2026.XLSX · SHEET 1", {
                align: "center",
                baseline: "middle",
                size: 12,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 1.5,
              });
              var x0 = f.x + 16,
                gut = 52,
                cols = [244, 240, 128, 200],
                heads = ["Company", "Role", "Applied", "Status"],
                top = f.y + 96,
                rh = 56;
              g.fillStyle = "#f1f1f4";
              g.fillRect(x0, top, gut + cols[0] + cols[1] + cols[2] + cols[3], 44);
              var cxp = x0 + gut;
              for (var h = 0; h < 4; h++) {
                txt(cxp + 14, top + 28, heads[h], {
                  size: 13.5,
                  weight: 700,
                  color: BODY,
                });
                cxp += cols[h];
              }
              var rows = [
                ["Northwind", "APM Program", "Jul 24", "Final round", "#ede9fe", INDIGO],
                ["Bluepeak", "Data Analyst", "Jul 28", "Applied", "#f1f1f4", SUB],
                ["Vantage Systems", "Growth Marketing", "Jun 30", "Rejected", "#fbeaea", "#b3261e"],
                ["Ridgeline", "SWE Intern", "Aug 2", "Phone screen", "#e8f0fe", GBLUE],
                ["Crestline Partners", "Strategy Analyst", "Aug 9", "Applied", "#f1f1f4", SUB],
                ["Halston & Cross", "IB Summer Analyst", "Aug 30", "Superday", "#e0f2f1", TEAL],
                ["Loopcart", "PM Intern", "Sep 3", "OA due", "#fff3e0", "#b45309"],
                ["Ember Fitness", "Growth Analyst", "Sep 5", "No reply", "#f1f1f4", FAINT],
                ["Beacon Health", "Design Intern", "Sep 12", "Offer", "#e7f4ec", GREEN],
              ];
              var tw = gut + cols[0] + cols[1] + cols[2] + cols[3];
              for (var r = 0; r < rows.length; r++) {
                var ry = top + 44 + r * rh;
                hr(x0, ry, tw);
                txt(x0 + gut / 2, ry + rh / 2 + 1, String(r + 1), {
                  align: "center",
                  baseline: "middle",
                  size: 12.5,
                  fam: MONOF,
                  color: FAINT,
                });
                var cx2 = x0 + gut;
                for (var c2 = 0; c2 < 3; c2++) {
                  txt(cx2 + 14, ry + rh / 2 + 1, rows[r][c2], {
                    size: 13.5,
                    baseline: "middle",
                    color: c2 === 0 ? INK : BODY,
                    weight: c2 === 0 ? 600 : 400,
                  });
                  cx2 += cols[c2];
                }
                var chw = measure(rows[r][3], { size: 12, weight: 600 }) + 28;
                rrPath(cx2 + 14, ry + rh / 2 - 15, chw, 30, 15);
                g.fillStyle = rows[r][4];
                g.fill();
                txt(cx2 + 14 + chw / 2, ry + rh / 2 + 1, rows[r][3], {
                  align: "center",
                  baseline: "middle",
                  size: 12,
                  weight: 600,
                  color: rows[r][5],
                });
              }
              hr(x0, top + 44 + rows.length * rh, tw);
              var vx = x0;
              vr(vx, top, 44 + rows.length * rh);
              vx += gut;
              for (var v = 0; v < 4; v++) {
                vr(vx, top, 44 + rows.length * rh);
                vx += cols[v];
              }
              vr(vx, top, 44 + rows.length * rh);
              txt(
                x0,
                f.y + f.h - 40,
                "9 OF 47 APPLICATIONS · LAST EDITED 1:14 AM",
                { size: 12.5, weight: 600, fam: MONOF, color: FAINT, ls: 1.5 },
              );
            },
            // 18 - thank-you note, compose window
            function (f) {
              g.fillStyle = "#f0f0f2";
              g.fillRect(f.x, f.y, f.w, 54);
              hr(f.x, f.y + 54, f.w, "rgba(20,20,25,0.10)", 1.5);
              var dots = ["#ff5f57", "#febc2e", "#28c840"];
              for (var d = 0; d < 3; d++) {
                g.fillStyle = dots[d];
                g.beginPath();
                g.arc(f.x + 30 + d * 24, f.y + 27, 7, 0, Math.PI * 2);
                g.fill();
              }
              txt(f.x + f.w / 2, f.y + 28, "NEW MESSAGE", {
                align: "center",
                baseline: "middle",
                size: 12,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 1.5,
              });
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 108, "To:", { size: 14, color: FAINT });
              txt(x + 50, f.y + 108, "grace.lin@northwind.com", {
                size: 14.5,
                color: BODY,
              });
              hr(x, f.y + 126, w);
              txt(x, f.y + 166, "Subject:", { size: 14, color: FAINT });
              txt(x + 92, f.y + 166, "Thank you + a follow-up thought", {
                size: 14.5,
                weight: 600,
                color: INK,
              });
              hr(x, f.y + 184, w);
              var y = f.y + 240;
              txt(x, y, "Hi Grace,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "Thank you for today's conversation. I especially enjoyed the retention case, and I keep thinking about the aha-moment metric you mentioned.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "One follow-up: I sketched how I would instrument the first-session funnel we discussed. Happy to share it if useful.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "Either way, I would be thrilled to build at Northwind.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              txt(x, y, "Best,", { size: 15.5, color: BODY });
              y += 24;
              txt(x, y, "Amara", { size: 15.5, color: BODY });
              var by = f.y + f.h - 110;
              btn(x, by, 120, 50, "Send", { bg: GBLUE, r: 9, size: 15.5 });
              txt(x + 140, by + 26, "📎 funnel-sketch.png", {
                size: 13,
                color: SUB,
                baseline: "middle",
              });
              txt(f.x + f.w - 44, by + 26, "Draft saved", {
                size: 12,
                color: FAINT,
                align: "right",
                baseline: "middle",
              });
            },
            // 19 - resume: sofia almeida, product design
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120,
                lx = x,
                cxr = x + 236;
              txt(x, f.y + 100, "sofia almeida", { size: 44, weight: 300 });
              txt(x, f.y + 132, "product designer · sofiaalmeida.design · sofia@almeida.co", {
                size: 13,
                color: SUB,
              });
              hr(x, f.y + 160, w, "rgba(20,20,25,0.42)", 1.6);
              function label(y, t) {
                txt(lx, y, t, {
                  size: 12,
                  weight: 700,
                  fam: MONOF,
                  color: SUB,
                  ls: 2,
                });
              }
              function bullet(y, s) {
                txt(cxr + 6, y, "•", { size: 14 });
                return (
                  wrap(cxr + 26, y, w - 236 - 26, s, {
                    size: 13.8,
                    lh: 20,
                    color: BODY,
                  }) + 2
                );
              }
              var y = f.y + 216;
              label(y, "EXPERIENCE");
              txt(cxr, y, "Product Design Intern", { size: 15, weight: 700 });
              txt(rx, y, "Summer 2026", {
                size: 13.5,
                align: "right",
                color: BODY,
              });
              y += 22;
              txt(cxr, y, "Beacon Health, Boston, MA", {
                size: 13.5,
                style: "italic",
                color: SUB,
              });
              y += 24;
              y = bullet(
                y,
                "Redesigned appointment booking; task success rose from 64% to 91% in usability tests",
              );
              y = bullet(
                y,
                "Built mobile design-system tokens in Figma (58 components, 4 themes)",
              );
              y += 14;
              txt(cxr, y, "Freelance Brand & Web", { size: 15, weight: 700 });
              txt(rx, y, "2024 – 2026", {
                size: 13.5,
                align: "right",
                color: BODY,
              });
              y += 24;
              y = bullet(
                y,
                "Shipped 14 client sites; average Lighthouse accessibility score of 98",
              );
              y = bullet(
                y,
                "Ran brand sprints from moodboard to launch in two weeks",
              );
              y += 30;
              hr(x, y - 16, w);
              label(y + 8, "EDUCATION");
              txt(cxr, y + 8, "Rhode Island School of Design", {
                size: 15,
                weight: 700,
              });
              txt(rx, y + 8, "2027", { size: 13.5, align: "right", color: BODY });
              y += 32;
              txt(cxr, y + 8, "B.F.A. Graphic Design · minor in HCI", {
                size: 13.5,
                style: "italic",
                color: SUB,
              });
              y += 60;
              hr(x, y - 16, w);
              label(y + 8, "TOOLS");
              wrap(
                cxr,
                y + 8,
                w - 236,
                "Figma, Framer, Principle, After Effects, HTML/CSS, a little SwiftUI",
                { size: 13.8, lh: 20, color: BODY },
              );
              y += 60;
              hr(x, y - 16, w);
              label(y + 8, "RECOGNITION");
              wrap(
                cxr,
                y + 8,
                w - 236,
                "Adobe Design Achievement finalist · RISD merit scholarship · Dribbble top shot, March 2026",
                { size: 13.8, lh: 20, color: BODY },
              );
            },
            // 20 - superday rejection, the formal one
            function (f) {
              mailChrome(f, "INBOX · 3,481 UNREAD");
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 150, "Your Halston & Cross candidacy", {
                size: 24,
                weight: 700,
              });
              fromRow(
                f,
                f.y + 216,
                "H",
                NAVY,
                "Halston & Cross Campus Recruiting",
                "<campus@halstoncross.com>",
                "Sep 12, 8:15 AM",
              );
              var y = f.y + 300;
              txt(x, y, "Dear Leo,", { size: 15.5, fam: SERIF, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "Thank you for joining us for Friday's superday and for the energy you brought to each conversation.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "Our committees faced an unusually deep cohort this cycle, and we are unable to extend an offer at this time. This decision reflects capacity, not your candidacy.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "We would welcome an application to our lateral associate programs after graduation, and we will flag your file accordingly.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              y += 10;
              txt(x, y, "Kind regards,", { size: 15.2, fam: SERIF, color: BODY });
              y += 24;
              txt(x, y, "Campus Recruiting · Halston & Cross", {
                size: 15.2,
                fam: SERIF,
                color: BODY,
              });
              txt(
                x,
                f.y + f.h - 40,
                "Halston & Cross · 200 Vesey Street, New York, NY",
                { size: 12, color: FAINT },
              );
            },
            // 21 - internship offer, awaiting signature
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120;
              rrPath(x, f.y + 44, 30, 30, 7);
              g.fillStyle = GREEN;
              g.fill();
              txt(x + 42, f.y + 66, "RIDGELINE", { size: 19, weight: 700, ls: 4 });
              txt(rx, f.y + 52, "441 BRYANT STREET", {
                size: 10.5,
                fam: MONOF,
                color: FAINT,
                align: "right",
                ls: 1,
              });
              txt(rx, f.y + 70, "SAN FRANCISCO, CA 94107", {
                size: 10.5,
                fam: MONOF,
                color: FAINT,
                align: "right",
                ls: 1,
              });
              hr(x, f.y + 96, w, "rgba(20,20,25,0.35)", 1.6);
              g.save();
              g.strokeStyle = ORANGE;
              g.lineWidth = 2.5;
              rrPath(rx - 262, f.y + 118, 262, 40, 20);
              g.stroke();
              txt(rx - 131, f.y + 139, "AWAITING SIGNATURE", {
                align: "center",
                baseline: "middle",
                size: 12.5,
                weight: 700,
                fam: MONOF,
                color: ORANGE,
                ls: 2,
              });
              g.restore();
              var y = f.y + 150;
              txt(x, y, "September 8, 2026", {
                size: 15,
                fam: SERIF,
                color: BODY,
              });
              y += 48;
              txt(x, y, "Re: Internship Offer · Software Engineer Intern", {
                size: 16.5,
                weight: 700,
              });
              y += 44;
              txt(x, y, "Dear Jordan,", { size: 15.2, fam: SERIF, color: INK });
              y += 32;
              y = wrap(
                x,
                y,
                w,
                "We are excited to offer you a Software Engineer Intern position at Ridgeline for Summer 2027. Your phone screen and onsite were among the strongest of the cycle.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              y += 18;
              var rows = [
                ["MONTHLY SALARY", "$8,800"],
                ["HOUSING STIPEND", "$3,000"],
                ["LOCATION", "San Francisco · Onsite"],
                ["START DATE", "Monday, June 14, 2027"],
              ];
              for (var t = 0; t < rows.length; t++) {
                var ry = y + t * 46;
                txt(x + 4, ry + 30, rows[t][0], {
                  size: 12.5,
                  weight: 600,
                  fam: MONOF,
                  color: SUB,
                  ls: 1,
                });
                txt(x + 370, ry + 30, rows[t][1], { size: 16, weight: 700 });
                hr(x, ry + 44, w, LINE, 1.2);
              }
              y += rows.length * 46 + 40;
              y = wrap(
                x,
                y,
                w,
                "Please sign below by September 22, 2026 to accept. We would love to build with you.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              var sy = f.y + f.h - 190;
              txt(x + 6, sy + 44, "Maya Chen", {
                size: 40,
                style: "italic",
                fam: SCRIPT,
                color: "#14142c",
              });
              hr(x, sy + 58, 320, "rgba(20,20,25,0.5)", 1.6);
              txt(x, sy + 84, "Maya Chen · Head of Engineering", {
                size: 12.5,
                color: SUB,
              });
              g.fillStyle = HIGHLIGHT;
              g.fillRect(rx - 330, sy - 4, 330, 66);
              hr(rx - 320, sy + 58, 320, "rgba(20,20,25,0.5)", 1.6);
              txt(rx - 320, sy + 84, "Jordan Reyes · Candidate", {
                size: 12.5,
                color: SUB,
              });
              txt(rx, sy + 84, "SIGN BY SEP 22", {
                size: 10.5,
                weight: 700,
                fam: MONOF,
                color: ORANGE,
                align: "right",
                ls: 1,
              });
              txt(x, f.y + f.h - 40, "RIDGELINE · OFFER · CONFIDENTIAL", {
                size: 11,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 2,
              });
            },
            // 22 - reference request, sent at midnight
            function (f) {
              mailChrome(f, "SENT · 11:48 PM");
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 150, "Quick favor: reference for Ridgeline?", {
                size: 24,
                weight: 700,
              });
              fromRow(
                f,
                f.y + 216,
                "JR",
                "#b45309",
                "Jordan Reyes",
                "<jordanreyes.dev@gmail.com>",
                "11:48 PM",
                "to r.delgado@usc.edu",
              );
              var y = f.y + 300;
              txt(x, y, "Hi Professor Delgado,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "I made it to the final round for Ridgeline's Software Engineer Intern role. The team builds developer tools, very aligned with your systems course. Could I list you as a reference? They may reach out late next week.",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              y = wrap(
                x,
                y,
                w,
                "Happy to send my resume and the role description. Thank you for everything this semester!",
                { size: 15.5, lh: 24 },
              );
              y += 10;
              txt(x, y, "Jordan", { size: 15.5, color: BODY });
              txt(x, f.y + f.h - 40, "1 attachment: Jordan_Reyes_Resume.pdf", {
                size: 12,
                color: FAINT,
              });
            },
            // 23 - the full-time offer, countersigned and stamped
            function (f) {
              crease(f, 0.34);
              crease(f, 0.67);
              var x = f.x + 60,
                rx = f.x + f.w - 60,
                w = f.w - 120;
              g.save();
              g.translate(x + 14, f.y + 58);
              g.rotate(Math.PI / 4);
              g.fillStyle = INDIGO;
              g.fillRect(-11, -11, 22, 22);
              g.restore();
              txt(x + 42, f.y + 66, "NORTHWIND", { size: 19, weight: 700, ls: 4 });
              txt(rx, f.y + 52, "88 HUDSON YARDS", {
                size: 10.5,
                fam: MONOF,
                color: FAINT,
                align: "right",
                ls: 1,
              });
              txt(rx, f.y + 70, "NEW YORK, NY 10001", {
                size: 10.5,
                fam: MONOF,
                color: FAINT,
                align: "right",
                ls: 1,
              });
              hr(x, f.y + 96, w, "rgba(20,20,25,0.35)", 1.6);
              var y = f.y + 150;
              txt(x, y, "September 12, 2026", {
                size: 15,
                fam: SERIF,
                color: BODY,
              });
              y += 48;
              txt(x, y, "Re: Offer of Employment · Associate Product Manager", {
                size: 16.5,
                weight: 700,
              });
              y += 44;
              txt(x, y, "Dear Amara,", { size: 15.2, fam: SERIF, color: INK });
              y += 32;
              y = wrap(
                x,
                y,
                w,
                "On behalf of the product organization, I am delighted to offer you a place in Northwind's Associate Product Manager program, Class of 2027. Your final-round case work stood out, and we think you will thrive here.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              y += 18;
              var rows = [
                ["BASE SALARY", "$118,000"],
                ["SIGN-ON BONUS", "$10,000"],
                ["EQUITY", "4,000 RSUs · 4-year vest"],
                ["START DATE", "Monday, August 2, 2027"],
              ];
              for (var t = 0; t < rows.length; t++) {
                var ry = y + t * 46;
                txt(x + 4, ry + 30, rows[t][0], {
                  size: 12.5,
                  weight: 600,
                  fam: MONOF,
                  color: SUB,
                  ls: 1,
                });
                txt(x + 370, ry + 30, rows[t][1], { size: 16, weight: 700 });
                hr(x, ry + 44, w, LINE, 1.2);
              }
              y += rows.length * 46 + 40;
              y = wrap(
                x,
                y,
                w,
                "Please countersign below by September 26, 2026. Welcome to the program.",
                { size: 15.2, lh: 24, fam: SERIF },
              );
              var sy = f.y + f.h - 190;
              txt(x + 6, sy + 44, "Elena Ferro", {
                size: 40,
                style: "italic",
                fam: SCRIPT,
                color: "#14142c",
              });
              hr(x, sy + 58, 320, "rgba(20,20,25,0.5)", 1.6);
              txt(x, sy + 84, "Elena Ferro · Director of Product", {
                size: 12.5,
                color: SUB,
              });
              g.fillStyle = HIGHLIGHT;
              g.fillRect(rx - 330, sy - 4, 330, 66);
              txt(rx - 316, sy + 44, "Amara Osei", {
                size: 40,
                style: "italic",
                fam: SCRIPT,
                color: "#1b3fa0",
              });
              hr(rx - 320, sy + 58, 320, "rgba(20,20,25,0.5)", 1.6);
              txt(rx - 320, sy + 84, "Amara Osei · Candidate", {
                size: 12.5,
                color: SUB,
              });
              stamp(f.x + f.w - 230, f.y + 240, "ACCEPTED", "SEP 13, 2026", GREEN, -0.13);
              txt(x, f.y + f.h - 40, "NORTHWIND · OFFER · CONFIDENTIAL", {
                size: 11,
                weight: 600,
                fam: MONOF,
                color: FAINT,
                ls: 2,
              });
            },
            // 24 - onboarding: welcome aboard
            function (f) {
              var x = f.x + 44,
                w = f.w - 88;
              txt(x, f.y + 128, "Welcome to Northwind, Amara!", {
                size: 26,
                weight: 700,
              });
              fromRow(
                f,
                f.y + 192,
                "N",
                INDIGO,
                "Northwind People Ops",
                "<people@northwind.com>",
                "Sep 21, 9:00 AM",
              );
              var y = f.y + 274;
              txt(x, y, "Hi Amara,", { size: 15.5, color: BODY });
              y += 34;
              y = wrap(
                x,
                y,
                w,
                "We are so excited. Your start date is Monday, August 2, 2027, and your first stop is APM orientation on the 14th floor. A few things before day one:",
                { size: 15.5, lh: 24 },
              );
              var cy = y + 26;
              checkbox(x, cy, true, "Sign your I-9 and W-4 in the portal");
              checkbox(x, cy + 58, true, "Upload ID documents for verification");
              checkbox(x, cy + 116, false, "Choose your laptop and monitor setup");
              checkbox(x, cy + 174, false, "Say hi to your onboarding buddy, Tomás");
              btn(x, cy + 246, 280, 54, "Open onboarding portal", {
                bg: INDIGO,
                r: 9,
                size: 15.5,
              });
              txt(
                x,
                f.y + f.h - 40,
                "People Operations · Northwind · New York",
                { size: 12, color: FAINT },
              );
            },
          ];

          for (var c = 0; c < ATLAS_N; c++) {
            g.save();
            g.setTransform(
              K,
              0,
              0,
              K,
              (c % ATLAS_COLS) * CELL,
              Math.floor(c / ATLAS_COLS) * CELL,
            );
            var frame = cardFrame();
            draws[c](frame);
            indexTag(frame, c + 1);
            g.restore();
          }
          g.setTransform(1, 0, 0, 1, 0, 0);

          var tex = new THREE.CanvasTexture(cv);
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          return tex;
        }

        // Spiral cap: hundreds of wound paper layers, drawn once
        function buildCapTexture() {
          var S = 1024;
          var cv = document.createElement("canvas");
          cv.width = S;
          cv.height = S;
          var g = cv.getContext("2d");
          var cx = S / 2,
            innerPx = (INNER_R / ROLL_R) * (S / 2);

          g.fillStyle = "#f2f1ec";
          g.fillRect(0, 0, S, S);

          for (var r = innerPx; r < S / 2 - 1; r += 2.1) {
            var a = 0.045 + rand() * 0.1 + (r % 29 < 2.2 ? 0.12 : 0);
            g.strokeStyle = "rgba(112,110,102," + a.toFixed(3) + ")";
            g.lineWidth = rand() < 0.12 ? 1.6 : 0.8;
            g.beginPath();
            g.arc(cx, cx, r, 0, Math.PI * 2);
            g.stroke();
          }
          // spiral cut line
          g.strokeStyle = "rgba(90,88,80,0.35)";
          g.lineWidth = 1.4;
          g.beginPath();
          var turns = 26;
          for (var t = 0; t <= 1; t += 0.002) {
            var rr = innerPx + t * (S / 2 - innerPx - 2);
            var an = t * turns * Math.PI * 2;
            var px = cx + Math.cos(an) * rr,
              py = cx + Math.sin(an) * rr;
            if (t === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.stroke();
          // inner shading
          var sh = g.createRadialGradient(
            cx,
            cx,
            innerPx,
            cx,
            cx,
            innerPx + 90,
          );
          sh.addColorStop(0, "rgba(60,58,52,0.32)");
          sh.addColorStop(1, "rgba(60,58,52,0)");
          g.fillStyle = sh;
          g.beginPath();
          g.arc(cx, cx, S / 2, 0, Math.PI * 2);
          g.fill();
          // outer rim
          var rim = g.createRadialGradient(cx, cx, S / 2 - 26, cx, cx, S / 2);
          rim.addColorStop(0, "rgba(60,58,52,0)");
          rim.addColorStop(1, "rgba(60,58,52,0.22)");
          g.fillStyle = rim;
          g.beginPath();
          g.arc(cx, cx, S / 2, 0, Math.PI * 2);
          g.fill();

          var tex = new THREE.CanvasTexture(cv);
          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          return tex;
        }

        // Blob shadow under the roll
        function buildBlobTexture() {
          var S = 256;
          var cv = document.createElement("canvas");
          cv.width = S;
          cv.height = S;
          var g = cv.getContext("2d");
          var gr = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
          gr.addColorStop(0, "rgba(20,20,22,0.34)");
          gr.addColorStop(0.55, "rgba(20,20,22,0.14)");
          gr.addColorStop(1, "rgba(20,20,22,0)");
          g.fillStyle = gr;
          g.fillRect(0, 0, S, S);
          return new THREE.CanvasTexture(cv);
        }

        var atlasTex = buildAtlas();
        var capTex = buildCapTexture();

        // ============================================================
        // The roll
        // ============================================================
        var rollGroup = new THREE.Group(); // yaw + position
        var spinner = new THREE.Group(); // rolls about local X
        rollGroup.add(spinner);
        scene.add(rollGroup);

        // The drum shows, at every angle, exactly the sheet it is about
        // to print there: contU = sTotal plus the arc still to travel,
        // so the window advances through all 24 sheets and stays
        // perfectly continuous with the peel. The mesh no longer spins
        // (a cylinder is rotation-invariant); only its print rotates,
        // via uRoll. 3.0 below is ATLAS_N / CARDS_PER_REV.
        var uRoll = { value: 0 };
        var paperMat = new THREE.MeshStandardMaterial({
          map: atlasTex,
          roughness: 0.92,
          metalness: 0,
        });
        paperMat.onBeforeCompile = function (shader) {
          shader.uniforms.uRoll = uRoll;
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uRoll;",
            )
            .replace(
              "#include <map_fragment>",
              gridMapChunk("fract(uRoll + (vUv.x - 0.75) / 3.0)", ""),
            );
        };

        var barrelGeo = new THREE.CylinderGeometry(
          ROLL_R,
          ROLL_R,
          RIBBON_W,
          96,
          1,
          true,
        );
        barrelGeo.rotateZ(Math.PI / 2);
        var barrel = new THREE.Mesh(barrelGeo, paperMat);
        barrel.castShadow = true;
        rollGroup.add(barrel);

        var capMat = new THREE.MeshStandardMaterial({
          map: capTex,
          roughness: 0.95,
          metalness: 0,
        });
        var capGeo = new THREE.RingGeometry(INNER_R, ROLL_R, 96, 1);
        var capR = new THREE.Mesh(capGeo, capMat);
        capR.rotation.y = Math.PI / 2;
        capR.position.x = RIBBON_W / 2 + 0.001;
        capR.castShadow = true;
        spinner.add(capR);
        var capL = new THREE.Mesh(capGeo, capMat);
        capL.rotation.y = -Math.PI / 2;
        capL.position.x = -RIBBON_W / 2 - 0.001;
        capL.castShadow = true;
        spinner.add(capL);

        var coreGeo = new THREE.CylinderGeometry(
          INNER_R,
          INNER_R,
          RIBBON_W * 1.002,
          48,
          1,
          true,
        );
        coreGeo.rotateZ(Math.PI / 2);
        var core = new THREE.Mesh(
          coreGeo,
          new THREE.MeshStandardMaterial({
            color: 0xdad7cf,
            roughness: 1,
            metalness: 0,
            side: THREE.DoubleSide,
          }),
        );
        spinner.add(core);

        var blob = new THREE.Mesh(
          new THREE.PlaneGeometry(ROLL_R * 3.4, RIBBON_W * 2.2),
          new THREE.MeshBasicMaterial({
            map: buildBlobTexture(),
            transparent: true,
            depthWrite: false,
          }),
        );
        blob.rotation.x = -Math.PI / 2;
        blob.renderOrder = 1;
        scene.add(blob);

        // ============================================================
        // Ribbon - one fixed-budget mesh, rebuilt in place each frame
        // ============================================================
        var VERTS = (MAX_SEG + 1) * 2;
        var posArr = new Float32Array(VERTS * 3);
        var nrmArr = new Float32Array(VERTS * 3);
        var uvArr = new Float32Array(VERTS * 2);
        var sArr = new Float32Array(VERTS);
        var idxArr = new Uint16Array(MAX_SEG * 6);
        for (var iq = 0; iq < MAX_SEG; iq++) {
          var v0 = iq * 2;
          idxArr[iq * 6 + 0] = v0;
          idxArr[iq * 6 + 1] = v0 + 1;
          idxArr[iq * 6 + 2] = v0 + 2;
          idxArr[iq * 6 + 3] = v0 + 1;
          idxArr[iq * 6 + 4] = v0 + 3;
          idxArr[iq * 6 + 5] = v0 + 2;
        }

        var ribbonGeo = new THREE.BufferGeometry();
        ribbonGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage),
        );
        ribbonGeo.setAttribute(
          "normal",
          new THREE.BufferAttribute(nrmArr, 3).setUsage(THREE.DynamicDrawUsage),
        );
        ribbonGeo.setAttribute(
          "uv",
          new THREE.BufferAttribute(uvArr, 2).setUsage(THREE.DynamicDrawUsage),
        );
        ribbonGeo.setAttribute(
          "aS",
          new THREE.BufferAttribute(sArr, 1).setUsage(THREE.DynamicDrawUsage),
        );
        ribbonGeo.setIndex(new THREE.BufferAttribute(idxArr, 1));
        ribbonGeo.setDrawRange(0, 0);

        var uTailS = { value: 0 };

        var ribbonMat = new THREE.MeshStandardMaterial({
          map: atlasTex,
          roughness: 0.9,
          metalness: 0,
          side: THREE.DoubleSide,
        });
        ribbonMat.onBeforeCompile = function (shader) {
          shader.uniforms.uTailS = uTailS;
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nattribute float aS;\nvarying float vS;",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvS = aS;",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying float vS;\nuniform float uTailS;",
            )
            .replace(
              "#include <map_fragment>",
              gridMapChunk(
                "fract(vUv.x)",
                // tail dissolves into the floor before recycling
                "float tail = smoothstep(uTailS, uTailS + 3.0, vS);\n" +
                  "diffuseColor.rgb = mix(" +
                  FLOOR_RGB +
                  ", diffuseColor.rgb, tail);",
              ),
            );
        };

        var ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
        ribbon.frustumCulled = false;
        ribbon.receiveShadow = true;
        scene.add(ribbon);

        // ============================================================
        // Motion solver - heavy spring-damper, real rolling
        // ============================================================
        var pos = new THREE.Vector2(0, 0);
        var vel = new THREE.Vector2(0, 0);
        var target = new THREE.Vector2(0, 0);
        var yaw = 0;
        var sTotal = 0;
        var REV = 2 * Math.PI * ROLL_R;

        var SPRING = 16.0;
        var DAMP = 5.4;
        var MAX_SPEED = 9.0;

        // path history - preallocated ring of plain records
        var hx = new Float32Array(MAX_PTS);
        var hz = new Float32Array(MAX_PTS);
        var hs = new Float32Array(MAX_PTS);
        var head = -1; // index of newest
        var count = 0;

        function pushPoint(x, z, s) {
          head = (head + 1) % MAX_PTS;
          hx[head] = x;
          hz[head] = z;
          hs[head] = s;
          if (count < MAX_PTS) count++;
        }
        function getPt(i, out) {
          // i = 0 oldest … count-1 newest
          var k = (head - (count - 1) + i + MAX_PTS * 2) % MAX_PTS;
          out.x = hx[k];
          out.z = hz[k];
          out.s = hs[k];
        }

        pushPoint(0, 0, 0);

        function angleLerp(a, b, t) {
          var d = b - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          return a + d * t;
        }

        var _acc = new THREE.Vector2();
        var _dp = new THREE.Vector2();

        function stepMotion(dt) {
          _acc.copy(target).sub(pos).multiplyScalar(SPRING);
          _acc.addScaledVector(vel, -DAMP);
          vel.addScaledVector(_acc, dt);
          var sp = vel.length();
          if (sp > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / sp);
          _dp.copy(vel).multiplyScalar(dt);
          var ds = _dp.length();
          if (ds > 1e-6) {
            pos.add(_dp);
            sTotal += ds;
            if (sp > 0.06) {
              var ty = Math.atan2(vel.x, vel.y); // vel.y is world z
              yaw = angleLerp(yaw, ty, 1 - Math.exp(-7 * dt));
            }
            // sample the path by distance, never by time
            var lx = hx[head],
              lz = hz[head];
            var ddx = pos.x - lx,
              ddz = pos.y - lz;
            if (ddx * ddx + ddz * ddz >= STEP * STEP) {
              pushPoint(pos.x, pos.y, sTotal);
            }
          }
        }

        // ============================================================
        // Ribbon rebuild - zero allocations
        // ============================================================
        var _a = { x: 0, z: 0, s: 0 };
        var _b = { x: 0, z: 0, s: 0 };
        var _c = { x: 0, z: 0, s: 0 };
        var CURL_MAX = 0.85; // radians of peel wrapped onto the barrel

        function writeVert(vi, x, y, z, nx, ny, nz, u, vv, s) {
          var p3 = vi * 3,
            p2 = vi * 2;
          posArr[p3] = x;
          posArr[p3 + 1] = y;
          posArr[p3 + 2] = z;
          nrmArr[p3] = nx;
          nrmArr[p3 + 1] = ny;
          nrmArr[p3 + 2] = nz;
          uvArr[p2] = u;
          uvArr[p2 + 1] = vv;
          sArr[vi] = s;
        }

        function rebuildRibbon() {
          var n = count;
          if (n < 2) {
            ribbonGeo.setDrawRange(0, 0);
            return;
          }

          getPt(0, _a);
          var sTail = _a.s;
          var half = RIBBON_W / 2;
          var vi = 0;
          var uSpan = CARD_LEN * ATLAS_N;
          var uBase = Math.floor(sTail / uSpan) * uSpan;

          // smoothed forward from yaw - stable even when velocity crosses zero
          var fx = Math.sin(yaw),
            fz = Math.cos(yaw);
          var sxc = fz,
            szc = -fx;

          // ---- flat printed trail ----
          var ptx = 0,
            ptz = 0,
            hasPrev = false;
          for (var i = 0; i < n; i++) {
            getPt(i, _b);
            var tx, tz;
            if (i === n - 1) {
              // head tangent from smoothed yaw, never from noisy point deltas
              tx = fx;
              tz = fz;
            } else {
              var i0 = i > 0 ? i - 1 : 0;
              var i1 = i + 1;
              getPt(i0, _a);
              getPt(i1, _c);
              tx = _c.x - _a.x;
              tz = _c.z - _a.z;
            }
            var tl = Math.sqrt(tx * tx + tz * tz);
            if (tl < 1e-4) {
              // degenerate delta at a reversal: reuse the previous tangent
              tx = hasPrev ? ptx : fx;
              tz = hasPrev ? ptz : fz;
            } else {
              tx /= tl;
              tz /= tl;
            }
            // continuity guard: never let the strip twist through a flip
            if (hasPrev && tx * ptx + tz * ptz < 0) {
              tx = ptx;
              tz = ptz;
            }
            ptx = tx;
            ptz = tz;
            hasPrev = true;
            var sx = tz,
              sz = -tx; // side vector on the floor

            // width taper at the tail so recycling is invisible
            var w = half;
            var fromTail = _b.s - sTail;
            if (fromTail < 3.0) w *= fromTail / 3.0;

            // newer paper lies on top; the head gets an extra ramp so fresh paper
            // laid over a just-reversed spot never z-fights with itself
            var y = 0.012 + (_b.s - sTail) * 0.0008;
            var headBlend = 1 - (sTotal - _b.s) / 1.5;
            if (headBlend > 0) y += 0.0035 * headBlend;
            var u = (_b.s - uBase) / uSpan;
            writeVert(
              vi++,
              _b.x + sx * w,
              y,
              _b.z + sz * w,
              0,
              1,
              0,
              u,
              0,
              _b.s - uBase,
            );
            writeVert(
              vi++,
              _b.x - sx * w,
              y,
              _b.z - sz * w,
              0,
              1,
              0,
              u,
              1,
              _b.s - uBase,
            );
          }

          // ---- bridge to the live contact point ----
          var yTop = 0.012 + (sTotal - sTail) * 0.0008 + 0.0035;
          var uC = (sTotal - uBase) / uSpan;
          writeVert(
            vi++,
            pos.x + sxc * half,
            yTop,
            pos.y + szc * half,
            0,
            1,
            0,
            uC,
            0,
            sTotal - uBase,
          );
          writeVert(
            vi++,
            pos.x - sxc * half,
            yTop,
            pos.y - szc * half,
            0,
            1,
            0,
            uC,
            1,
            sTotal - uBase,
          );

          // ---- peel: unprinted paper coming down the front of the barrel ----
          // this is the physically correct side - the card rolling down the front
          // is exactly the card the atlas shows there, so the hand-off is seamless
          for (var j = 1; j <= CURL_SEG; j++) {
            var th = (j / CURL_SEG) * CURL_MAX;
            var rr = ROLL_R + 0.012;
            var px = pos.x + fx * Math.sin(th) * rr;
            var pz = pos.y + fz * Math.sin(th) * rr;
            var py = yTop + rr * (1 - Math.cos(th));
            // paper-face normal, continuous with the flat trail at th = 0
            var nx = -fx * Math.sin(th),
              nyv = Math.cos(th),
              nz = -fz * Math.sin(th);
            var sHere = sTotal + th * ROLL_R;
            var uH = (sHere - uBase) / uSpan;
            writeVert(
              vi++,
              px + sxc * half,
              py,
              pz + szc * half,
              nx,
              nyv,
              nz,
              uH,
              0,
              sHere - uBase,
            );
            writeVert(
              vi++,
              px - sxc * half,
              py,
              pz - szc * half,
              nx,
              nyv,
              nz,
              uH,
              1,
              sHere - uBase,
            );
          }

          var segs = vi / 2 - 1;
          ribbonGeo.setDrawRange(0, segs * 6);
          ribbonGeo.attributes.position.needsUpdate = true;
          ribbonGeo.attributes.normal.needsUpdate = true;
          ribbonGeo.attributes.uv.needsUpdate = true;
          ribbonGeo.attributes.aS.needsUpdate = true;

          uTailS.value = sTail - uBase;
        }

        // ============================================================
        // Input - pointer on the floor plane, with idle autopilot
        // ============================================================
        var raycaster = new THREE.Raycaster();
        var ndc = new THREE.Vector2(0, 0);
        var floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        var hit = new THREE.Vector3();
        var pointerActive = false;
        var lastPointerT = -1e9;
        var autoAngle = Math.PI * 0.25;

        function onPointer(e) {
          var x = e.clientX,
            y = e.clientY;
          if (e.touches && e.touches.length) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
          }
          if (x === undefined) return;
          var rect = container.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          ndc.x = ((x - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((y - rect.top) / rect.height) * 2 + 1;
          pointerActive = true;
          lastPointerT = performance.now();
        }
        window.addEventListener("pointermove", onPointer, { passive: true });
        window.addEventListener("pointerdown", onPointer, { passive: true });
        window.addEventListener("touchmove", onPointer, { passive: true });
        window.addEventListener("touchstart", onPointer, { passive: true });

        // Steering only; the hero never pauses. The site dissolves and
        // stops the whole scene on first scroll instead.
        var paused = false;

        function updateTarget(t, dt) {
          var idle = performance.now() - lastPointerT > 3200;
          if (pointerActive && !idle) {
            raycaster.setFromCamera(ndc, camera);
            if (raycaster.ray.intersectPlane(floorPlane, hit)) {
              target.set(hit.x, hit.z);
            }
          } else {
            // wandering autopilot - always in motion, never a straight line
            autoAngle +=
              dt *
              (0.34 +
                0.5 * Math.sin(t * 0.31) +
                0.3 * Math.sin(t * 0.113 + 2.1));
            target.set(
              pos.x + Math.sin(autoAngle) * 5.2,
              pos.y + Math.cos(autoAngle) * 5.2,
            );
          }
        }

        // ============================================================
        // Camera
        // ============================================================
        var camOffset = new THREE.Vector3(9.4, 11.0, 13.4);
        var camPos = new THREE.Vector3();
        var lookAt = new THREE.Vector3(0, 0.6, 0);
        var _desired = new THREE.Vector3();
        var intro = { zoom: 1.5 };

        function updateCamera(dt) {
          intro.zoom += (1 - intro.zoom) * (1 - Math.exp(-1.1 * dt));
          _desired.set(pos.x, 0, pos.y).addScaledVector(camOffset, intro.zoom);
          var k = 1 - Math.exp(-2.6 * dt);
          camPos.lerp(_desired, k);
          _desired.set(pos.x, 5.0, pos.y);
          lookAt.lerp(_desired, k);
          camera.position.copy(camPos);
          camera.lookAt(lookAt);
        }

        // ============================================================
        // Pre-roll: lay a trail before the first frame
        // ============================================================
        (function preroll() {
          var t0 = 0;
          for (var i = 0; i < 560; i++) {
            t0 += 1 / 60;
            autoAngle +=
              (1 / 60) *
              (0.34 +
                0.5 * Math.sin(t0 * 0.31) +
                0.3 * Math.sin(t0 * 0.113 + 2.1));
            target.set(
              pos.x + Math.sin(autoAngle) * 5.2,
              pos.y + Math.cos(autoAngle) * 5.2,
            );
            stepMotion(1 / 60);
          }
          camPos.set(pos.x, 0, pos.y).addScaledVector(camOffset, intro.zoom);
          lookAt.set(pos.x, 5.0, pos.y);
        })();

        // ============================================================
        // Main loop - fixed order, no allocations
        // ============================================================
        var clock = new THREE.Clock();
        var elapsed = 0;

        function frame() {
          if (stopped) return;
          requestAnimationFrame(frame);
          var dt = Math.min(clock.getDelta(), 1 / 30);
          elapsed += dt;

          if (!paused) {
            updateTarget(elapsed, dt);
            stepMotion(dt);

            rollGroup.position.set(pos.x, ROLL_R, pos.y);
            rollGroup.rotation.y = yaw;
            spinner.rotation.x = (sTotal % REV) / ROLL_R;
            uRoll.value = (sTotal % U_SPAN) / U_SPAN;

            rebuildRibbon();

            blob.position.set(pos.x, 0.006, pos.y);
            blob.rotation.z = yaw - Math.PI / 2;

            floor.position.set(pos.x, 0, pos.y);
            sun.position.set(pos.x + 5, 10, pos.y + 4);
            sun.target.position.set(pos.x, 0, pos.y);
          }

          updateCamera(dt);

          renderer.render(scene, camera);
        }

        function refit() {
          vw = container.clientWidth || 1;
          vh = container.clientHeight || 1;
          camera.aspect = vw / vh;
          camera.updateProjectionMatrix();
          renderer.setSize(vw, vh);
        }
        window.addEventListener("resize", refit);
        var ro = null;
        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(refit);
          ro.observe(container);
        }

        frame();

        function stop() {
          if (stopped) return;
          stopped = true;
          window.removeEventListener("pointermove", onPointer);
          window.removeEventListener("pointerdown", onPointer);
          window.removeEventListener("touchmove", onPointer);
          window.removeEventListener("touchstart", onPointer);
          window.removeEventListener("resize", refit);
          if (ro) ro.disconnect();
          renderer.dispose();
          if (canvas.parentNode === container) container.removeChild(canvas);
        }
        return { stop: stop };
}
