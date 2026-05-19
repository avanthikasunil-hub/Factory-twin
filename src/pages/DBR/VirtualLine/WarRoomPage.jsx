import Select from "react-select";
import React, {
  Suspense,
  useState,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import {
  collection,
  onSnapshot,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { prodDb as db } from "../../../firebase";
import { API_BASE_URL } from "../../../config";
import {
  generateCotLayout,
  getLayoutSpecs,
  getMachineZoneDims,
  canonicalMachineType,
  FT,
  extractOpName,
  extractOpSMV
} from "./generatorCotLayout"; // Refreshed
import { generateVirtualFloorLayout, LANE_Z_CENTER_AB, LANE_Z_CENTER_CD } from "./virtualFloorLayoutGenerator";
import * as XLSX from "xlsx";

const MACHINE_NORMALISATION = {
  'bholemc': 'Button Hole M/C', 'buttonholemc': 'Button Hole M/C', 'bholem': 'Button Hole M/C',
  'buttonmc': 'Button M/C', 'buttonsew': 'Button M/C', 'buttonm': 'Button M/C',
  'snec': 'SNEC', 'pnec': 'SNEC', '3tol': 'SNEC', '4tol': 'SNEC', '5tol': 'SNEC', 'overlock': 'SNEC', '3to/l': 'SNEC', '4to/l': 'SNEC', '5to/l': 'SNEC', '3toverlock': 'SNEC', 'ol': 'SNEC',
  'snecmc': 'SNEC', 'snecm/c': 'SNEC',
  'kansai': 'Kansai', 'kansaismc': 'Kansai', 'kansaimc': 'Kansai',
  'dnls': 'DNLS', 'double': 'DNLS',
  'feedoffarm': 'FOA', 'foa': 'FOA',
  'irontable': 'Iron Table', 'ironingtable': 'Iron Table', 'pressingtable': 'Iron Table', 'ironing': 'Iron Table',
  'helpertable': 'Helper Table', 'manualtable': 'Helper Table', 'manual': 'Helper Table', 'trolley': 'Helper Table',
  'rotaryfusingmc': 'Rotary Fusing M/C', 'rotaryfusing': 'Rotary Fusing M/C',
  'buttonholestitch': 'Button Hole M/C', 'single': 'SNLS', 'lockstitch': 'SNLS', 'snls': 'SNLS'
};

const IGNORED_OPS = ['washing allowance', 'washing_allowance', 'thread sucking', 'allowance'];

function normalizeKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// ── Parse real SMV values from an uploaded OB Excel file ──
const _warRoomSMVCache = {};
const TOTAL_ROW_PATTERNS = [
  /^total$/i, /^sub.?total/i, /^grand.?total/i, /^section.?total/i,
  /^sum$/i, /^summary$/i, /^aggregate/i, /^overall/i,
  /^total\s+smv/i, /^smv\s+total/i, /^end\s+of/i
];
function isTotalOpName(name) {
  const s = String(name || '').trim();
  return s.length > 0 && TOTAL_ROW_PATTERNS.some(p => p.test(s));
}
async function parseSMVFromOBFile(fileUrl) {
  if (!fileUrl) return null;
  if (_warRoomSMVCache[fileUrl]) return _warRoomSMVCache[fileUrl];
  try {
    const resp = await fetch(fileUrl);
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const SMV_ALIASES = ['smv','sam','standardminute','stdmin','standardtime','cycletime','pitchtime','mins','min'];
    const smvMap = {};
    const SECTION_MAP = [['collar','Collar'],['cuff','Cuff'],['sleeve','Sleeve'],['front','Front'],['back','Back'],['assembly','Assembly'],['joining','Assembly'],['sewing','Assembly']];
    wb.SheetNames.forEach(sheetName => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows || rows.length < 2) return;
      let headerIdx = -1, smvCol = -1, opCol = -1, sectionCol = -1;
      for (let ri = 0; ri < Math.min(rows.length, 40); ri++) {
        const norm = rows[ri].map(c => normalizeKey(c));
        const si = norm.findIndex(c => SMV_ALIASES.includes(c));
        if (si >= 0) {
          headerIdx = ri; smvCol = si;
          opCol = norm.findIndex(c => ['operation','opname','description','particulars','process','b','c'].some(t => c.includes(t)));
          if (opCol < 0) opCol = 1;
          sectionCol = norm.findIndex(c => c.includes('section') || c.includes('dept') || c.includes('area'));
          break;
        }
      }
      if (headerIdx < 0 || smvCol < 0) return;
      let currentSection = 'General';
      for (let ri = headerIdx + 1; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!row || row.length === 0) continue;
        // detect section header rows
        const rowStr = row.join(' ').toLowerCase();
        const secMatch = SECTION_MAP.find(([kw]) => rowStr.includes(kw) && !String(row[smvCol]).trim());
        if (secMatch) { currentSection = secMatch[1]; continue; }
        const opName = normalizeKey(row[opCol]);
        if (!opName || opName.length < 3) continue;
        if (isTotalOpName(opName)) continue; // skip total/subtotal rows
        const rawSMV = parseFloat(String(row[smvCol]).replace(/[^\d.]/g, ''));
        // Per-op SMV sanity cap: real garment ops are < 15 min each
        if (!isNaN(rawSMV) && rawSMV > 0 && rawSMV < 15) {
          const sec = (sectionCol >= 0 && row[sectionCol]) ? String(row[sectionCol]).trim() : currentSection;
          if (!smvMap[opName]) smvMap[opName] = [];
          smvMap[opName].push({ smv: rawSMV, section: sec });
        }
      }
    });
    _warRoomSMVCache[fileUrl] = smvMap;
    console.log(`[WarRoom] Parsed ${Object.keys(smvMap).length} SMV entries from OB file`);
    return smvMap;
  } catch (err) {
    console.warn('[WarRoom] Failed to parse OB file for SMV:', err);
    return null;
  }
}

import fuzzy from "fuzzy";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Server,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Zap,
  CheckCircle2,
  Circle,
  ChevronRight,
  Scissors,
  Search,
  Settings,
  ShieldCheck
} from "lucide-react";

/* ───── HELPER FUNCTIONS FOR OB COMPARISON ───── */
function normalizeOpName(name) {
  if (!name) return "";
  // Ultra-clean: lowercase and remove ALL non-alphanumeric characters
  return name.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyCompare(opName, operations) {
  if (!opName || !operations || operations.length === 0) return false;
  const target = normalizeOpName(opName);
  if (!target) return false;
  
  return operations.some((o) => {
    const fName = normalizeOpName(o.operation || o.op_name || o.Operation || o.OperationName);
    return fName === target;
  });
}

function compareOBs(fromOps, toOps) {
  const external = [];
  const internal = [];
  if (!toOps || toOps.length === 0) return { external: [], internal: [] };
  if (!fromOps || fromOps.length === 0) {
    return {
      external: [],
      internal: toOps.map((op) => ({
        ...op,
        uniqueKey: `${op.op_no}-${normalizeOpName(op.operation || op.op_name)}`,
        machineArranged: op.machineArranged || "",
        folderArranged: op.folderArranged || "",
      })),
    };
  }
  for (const op of toOps) {
    if (fuzzyCompare(op.operation || op.op_name, fromOps)) internal.push(op);
    else external.push(op);
  }
  return {
    external: external.map((op) => ({
      ...op,
      uniqueKey: `${op.op_no}-${normalizeOpName(op.operation || op.op_name)}`,
      machineArranged: op.machineArranged || "",
      folderArranged: op.folderArranged || "",
    })),
    internal: internal.map((op) => ({
      ...op,
      uniqueKey: `${op.op_no}-${normalizeOpName(op.operation || op.op_name)}`,
      machineArranged: op.machineArranged || "",
      folderArranged: op.folderArranged || "",
    })),
  };
}

/* ───── CONSTANTS & THEMES ───── */
const DASHBOARD_THEME = {
  mainBg: "#dbd4d4",
  containerBg: "#efefef",
  headerBg: "#1a1a1a",
  border: "#cccccc",
  oldStyle: "#ef4444",
  changeover: "#facc15",
  newStyle: "#22c55e",
  floorLine: "#fbbf24",
};

// ─── CONSTANTS & CONFIG ─────────────────────────────────────────────
const STATUS = {
  producing: "#ef4444",
  changeover: "#facc15",
  punching: "#3b82f6",
  approved: "#22c55e",
};

const SEC_HEX = {
  collar: "#72b3c2",
  front: "#304965",
  back: "#aebbd1",
  sleeve: "#062994",
  cuff: "#0799cf",
  assembly: "#475569",
  general: "#94a3b8",
};

const MACHINE_ID_NAME_MAP = {
  DF: "SNLS DF",
  NF: "SNLS NF",
  BH: "BUTTON HOLE MACHINE",
  DNCS: "DNCS",
  OL: "OVERLOCK",
  BS: "BUTTON STITCH",
  EC: "EDGE CUTTER MACHINE",
  FOA: "FOA",
  "FRONT PLACKET": "FRONT PLACKET PRESS",
  WRAPPING: "WRAPPING MACHINE",
  "FOLDING TABLE": "FOLDING TABLE",
  "CUFF BLOCKING": "CUFF BLOCKING",
  DNLS: "DNLS",
  "BUTTON FEEDER": "BUTTON FEEDER MACHINE",
  BARTACK: "BARTACK MACHINE",
  "POST BED": "POST BED MACHINE",
};

function getCleanMachineName(m) {
  if (!m) return "General Machine";
  const mId = String(m.machine_id || m.id || "")
    .toUpperCase()
    .trim();
  for (const [prefix, name] of Object.entries(MACHINE_ID_NAME_MAP)) {
    if (mId.startsWith(prefix)) return name;
  }
  return (
    m.machine_type ||
    m.type ||
    m["Machine Type"] ||
    m.mc_type ||
    m.mc_model ||
    m.model ||
    "General Machine"
  );
}

const MODEL_MAP = {
  inspection: "inspection machine final.glb",
  snls: "snls.glb",
  dnls: "snls.glb",
  snec: "snls.glb",
  overlock: "3t ol.glb",
  ol: "3t ol.glb",
  "3t": "3t ol.glb",
  foa: "FOA.glb",
  "feed off arm": "FOA.glb",
  label: "labelattaching.glb",
  attach: "labelattaching.glb",
  wrapping: "wrapping.glb",
  wrap: "wrapping.glb",
  turning: "turning mc.glb",
  pointing: "pointing mc.glb",
  contour: "contourmc.glb",
  "iron press": "iron press.glb",
  iron: "iron press.glb",
  pressing: "pressing.glb",
  press: "pressing.glb",
  buttonhole: "buttonhole.glb",
  hole: "buttonhole.glb",
  bhole: "buttonhole.glb",
  "b/h": "buttonhole.glb",
  bh: "buttonhole.glb",
  buttonmaking: "buttonmakinggg.glb",
  buttonsew: "buttonmakinggg.glb",
  button: "buttonmakinggg.glb",
  bartack: "bartack.finalglb.glb",
  notch: "notchmc.glb",
  supermarket: "supermarket.glb",
  trolley: "helpers table.glb",
  helper: "helpers table.glb",
  "helper table": "helpers table.glb",
  table: "helpers table.glb",
  "rotary fusing": "rotaryfusing.glb",
  fusing: "fusing mc.glb",
  rotary: "rotaryfusing.glb",
  blocking: "blocking mc.glb",
  spreader: "spreader.glb",
  default: "last machine.glb",
};

function getModelUrl(type) {
  const canonical = canonicalMachineType(type);
  const t = canonical.toLowerCase();

  const sortedKeys = Object.keys(MODEL_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (key === "default") continue;
    if (t.includes(key)) return `/models/${MODEL_MAP[key]}`;
  }

  // Industrial Fallback Logic (Matching exhaustive OB variants)
  if (
    t.includes("snls") ||
    t.includes("lock") ||
    t.includes("single") ||
    t.includes("stitch") ||
    t.includes("plain")
  )
    return `/models/${MODEL_MAP.snls}`;
  if (
    t.includes("overlock") ||
    t.includes("ol") ||
    t.includes("edge") ||
    t.includes("snec") ||
    t.includes("3t") ||
    t.includes("5t")
  )
    return `/models/${MODEL_MAP.overlock}`;
  if (
    t.includes("iron") ||
    t.includes("press") ||
    t.includes("fusing") ||
    t.includes("steam")
  )
    return `/models/${MODEL_MAP.iron}`;
  if (t.includes("button") || t.includes("eyelet") || t.includes("hole"))
    return `/models/${MODEL_MAP.buttonhole}`;
  if (t.includes("bartack") || t.includes("bt") || t.includes("track"))
    return `/models/${MODEL_MAP.bartack}`;
  if (
    t.includes("manual") ||
    t.includes("table") ||
    t.includes("helper") ||
    t.includes("trolley")
  )
    return `/models/${MODEL_MAP.trolley}`;
  if (
    t.includes("turning") ||
    t.includes("pointing") ||
    t.includes("contour") ||
    t.includes("notch") ||
    t.includes("wrapping")
  )
    return `/models/${MODEL_MAP.turning}`;
  if (t.includes("supermarket")) return `/models/${MODEL_MAP.supermarket}`;

  return `/models/${MODEL_MAP.default}`;
}

const getTargetDims = (type) => {
  return getMachineZoneDims(type);
};



/* ───── 1. REUSABLE BASE COMPONENTS ───── */

const OperatorStool = ({ position }) => (
  <group position={position}>
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.6, 0.6, 0.15, 32]} />
      <meshStandardMaterial color="#2d3748" roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[0.05, 0.4, 0.6, 32]} />
      <meshStandardMaterial color="#1a202c" metalness={0.8} />
    </mesh>
  </group>
);

const MachineBase = ({ statusColor, width = 9.0, depth = 4.5 }) => (
  <group>
    <mesh position={[0, 1.2, 0]}>
      <boxGeometry args={[width, 0.25, depth]} />
      <meshStandardMaterial color="#e2e8f0" metalness={0.2} roughness={0.3} />
    </mesh>
    {[
      [-width / 2.2, 0.6, 0],
      [width / 2.2, 0.6, 0],
    ].map((p, i) => (
      <group key={i} position={p}>
        <mesh>
          <boxGeometry args={[0.4, 1.2, depth * 0.7]} />
          <meshStandardMaterial color="#2d3748" />
        </mesh>
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[0.8, 0.15, depth]} />
          <meshStandardMaterial color="#1a202c" />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 0.01, 0]}>
      <boxGeometry args={[width + 1.5, 0.05, depth + 1.5]} />
      <meshStandardMaterial
        color={statusColor}
        emissive={statusColor}
        emissiveIntensity={2}
        transparent
        opacity={0.4}
      />
    </mesh>
  </group>
);

/* ───── 2. DETAILED MACHINE MODELS ───── */

const HumanOperator = ({ id, rotation, isStanding, isInspection }) => {
  // Deterministic random behavior based on ID
  const seed = (id || "default")
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const isFemale = seed % 2 === 0;

  // Colors
  const skinColors = ["#f1c27d", "#ffdbac", "#e0ac69", "#8d5524", "#c68642"];
  const skinColor = skinColors[seed % skinColors.length];

  const maleShirtColors = [
    "#1e3a8a",
    "#047857",
    "#374151",
    "#7f1d1d",
    "#d97706",
  ];
  const femaleShirtColors = [
    "#be185d",
    "#7e22ce",
    "#047857",
    "#b91c1c",
    "#0f766e",
  ];
  const shirtColor = isFemale
    ? femaleShirtColors[seed % femaleShirtColors.length]
    : maleShirtColors[seed % maleShirtColors.length];

  const pantColors = ["#1e293b", "#334155", "#475569", "#0f172a"];
  const pantColor = pantColors[seed % pantColors.length];

  const hairColors = ["#0f0f0f", "#3b2f2f", "#4a3c31", "#d4af37", "#7b3f00"];
  const hairColor = hairColors[seed % hairColors.length];

  // Proportions
  const torsoWidth = isFemale ? 0.35 : 0.45;
  const torsoHeight = isFemale ? 0.55 : 0.6;
  const shoulderWidth = isFemale ? 0.4 : 0.5;

  return (
    <group
      position={[0, 0, isInspection ? 1.0 : 0.55]}
      rotation={[0, Math.PI, 0]}
      scale={[0.8, 0.8, 0.8]}
    >
      {/* --- CHAIR --- */}
      {!isStanding && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.4, 0.05, 0.4]} />
            <meshStandardMaterial color="#1e1e1e" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.225, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.45]} />
            <meshStandardMaterial
              color="#94a3b8"
              roughness={0.3}
              metalness={0.8}
            />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh
              key={i}
              position={[0, 0.05, 0]}
              rotation={[0, (i * Math.PI * 2) / 5, 0]}
            >
              <cylinderGeometry args={[0.02, 0.02, 0.4]} />
              <meshStandardMaterial
                color="#94a3b8"
                roughness={0.3}
                metalness={0.8}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.65, -0.18]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.05, 0.4, 0.02]} />
            <meshStandardMaterial
              color="#94a3b8"
              roughness={0.3}
              metalness={0.8}
            />
          </mesh>
          <mesh position={[0, 0.8, -0.2]}>
            <boxGeometry args={[0.35, 0.2, 0.05]} />
            <meshStandardMaterial color="#1e1e1e" roughness={0.4} />
          </mesh>
        </group>
      )}

      {/* --- HUMAN BODY --- */}
      <group position={[0, isStanding ? 0.75 : 0.48, isStanding ? 0.1 : 0]}>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[torsoWidth, 0.16, 0.25]} />
          <meshStandardMaterial color={pantColor} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.6]}>
          <cylinderGeometry
            args={[torsoWidth / 2, torsoWidth / 2.5, torsoHeight, 16]}
          />
          <meshStandardMaterial color={shirtColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight / 2, 0]} scale={[1, 1, 0.65]}>
          <cylinderGeometry
            args={[
              torsoWidth / 2 + 0.02,
              torsoWidth / 2.5 + 0.02,
              torsoHeight + 0.02,
              16,
            ]}
          />
          <meshStandardMaterial color="#bae6fd" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.16 + torsoHeight + 0.05, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.1]} />
          <meshStandardMaterial color={skinColor} roughness={0.6} />
        </mesh>
        <group position={[0, 0.16 + torsoHeight + 0.2, 0.02]}>
          <mesh>
            <sphereGeometry args={[0.13, 32, 32]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.01, 0.13]}>
            <sphereGeometry args={[0.02, 16, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.02, -0.04]} rotation={[-0.3, 0, 0]}>
            <sphereGeometry
              args={[0.135, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.6]}
            />
            <meshStandardMaterial color="#38bdf8" roughness={0.9} />
          </mesh>
        </group>
        {/* Arms */}
        {[-1, 1].map((side) => {
          const armRotX = isInspection ? -Math.PI / 3 : -Math.PI / 4;
          const lowerArmRotX = isInspection ? -Math.PI / 2.5 : -Math.PI / 2;
          const handPosZ = isInspection ? 0.6 : 0.52;
          const handPosY = isInspection ? -0.22 : -0.28;
          return (
            <group
              key={side}
              position={[
                side * (shoulderWidth / 2 + 0.05),
                0.16 + torsoHeight - 0.08,
                0,
              ]}
            >
              <mesh position={[0, -0.04, 0.02]} rotation={[-Math.PI / 4, 0, 0]}>
                <capsuleGeometry args={[0.05, 0.1, 4, 16]} />
                <meshStandardMaterial color={shirtColor} roughness={0.8} />
              </mesh>
              <mesh position={[0, -0.14, 0.11]} rotation={[armRotX, 0, 0]}>
                <capsuleGeometry args={[0.04, 0.24, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
              <mesh
                position={[0, handPosY, handPosZ - 0.16]}
                rotation={[lowerArmRotX, 0, 0]}
              >
                <capsuleGeometry args={[0.035, 0.28, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
              <mesh
                position={[0, handPosY, handPosZ]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <capsuleGeometry args={[0.035, 0.08, 4, 16]} />
                <meshStandardMaterial color={skinColor} roughness={0.6} />
              </mesh>
            </group>
          );
        })}
        {/* Legs */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[
              side * (torsoWidth / 2 - 0.08),
              0.08,
              isStanding ? 0 : 0.1,
            ]}
          >
            {isStanding ? (
              <>
                <mesh position={[0, -0.2, 0]} rotation={[0, 0, 0]}>
                  <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.58, 0]}>
                  <capsuleGeometry args={[0.055, 0.4, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh
                  position={[0, -0.85, 0.05]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                  <meshStandardMaterial color="#27272a" roughness={0.9} />
                </mesh>
              </>
            ) : (
              <>
                <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                  <capsuleGeometry args={[0.065, 0.3, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh position={[0, -0.25, 0.33]}>
                  <capsuleGeometry args={[0.055, 0.35, 4, 16]} />
                  <meshStandardMaterial color={pantColor} roughness={0.9} />
                </mesh>
                <mesh
                  position={[0, -0.48, 0.38]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <capsuleGeometry args={[0.045, 0.12, 4, 16]} />
                  <meshStandardMaterial color="#27272a" roughness={0.9} />
                </mesh>
              </>
            )}
          </group>
        ))}
      </group>
    </group>
  );
};

const GLBMachine = ({
  id,
  path,
  mType,
  statusColor,
  isPulsing,
  opLabel,
  smv,
  secColor,
  oldStyle = "---",
  newStyle = "---",
  rotation = [0, 0, 0],
  showStatusLights = true,
  isInspectionItem = false,
  allocatedLine = null,
  section = "General",
}) => {
  const finalShowLights = showStatusLights && !isInspectionItem;
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);

  const { scene: gltfScene } = useGLTF(path);
  const targetDims = useMemo(() => getTargetDims(mType), [mType]);

  const t = (mType || "snls").toLowerCase();
  const isFusing = t.includes("fusing") || t.includes("rotary");
  const isTurning = t.includes("turning");
  const isStanding =
    t.includes("inspection") ||
    t.includes("iron") ||
    t.includes("press") ||
    t.includes("fusing") ||
    t.includes("rotary") ||
    t.includes("helper") ||
    t.includes("table") ||
    t.includes("spreader");
  const needsOp = !t.includes("supermarket") && !t.includes("trolley");

  const processedScene = useMemo(() => {
    if (!gltfScene) return null;
    const cloned = gltfScene.clone();

    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sf = isTurning ? 1.4 : 1.0;

    let sx, sy, sz;
    if (isFusing) {
      sx = size.x > 0.001 ? (targetDims.length * sf) / size.z : 1;
      sy = size.y > 0.001 ? (targetDims.height * sf) / size.y : 1;
      sz = size.z > 0.001 ? (targetDims.width * sf) / size.x : 1;
      cloned.rotation.y = -Math.PI / 2;
      cloned.position.set(-center.z, -box.min.y, center.x);
    } else {
      sx = size.x > 0.001 ? (targetDims.length * sf) / size.x : 1;
      sy = size.y > 0.001 ? (targetDims.height * sf) / size.y : 1;
      sz = size.z > 0.001 ? (targetDims.width * sf) / size.z : 1;
      cloned.position.set(-center.x, -box.min.y, -center.z);
    }

    cloned.userData.computedScale = [sx, sy, sz];

    cloned.traverse((child) => {
      if (child.isMesh) {
        try {
          if ("castShadow" in child) child.castShadow = true;
          if ("receiveShadow" in child) child.receiveShadow = true;
        } catch (e) { }
        if (child.material) {
          const m = Array.isArray(child.material)
            ? child.material.map((mat) => mat.clone())
            : child.material.clone();
          const applyMat = (mat) => {
            if (mat) {
              mat.wireframe = false;
              mat.polygonOffset = true;
              mat.polygonOffsetFactor = -10; // Pull much more aggressively
              mat.polygonOffsetUnits = -10;
              mat.depthTest = true;
              mat.depthWrite = true;
              mat.side = THREE.FrontSide; // Avoid self-z-fighting with DoubleSide
            }
          };
          if (Array.isArray(m)) m.forEach(applyMat);
          else applyMat(m);
          child.material = m;
        }
      }
    });
    const wrapper = new THREE.Group();
    wrapper.add(cloned);
    wrapper.userData.computedScale = [sx, sy, sz];
    return wrapper;
  }, [gltfScene, mType, targetDims, isFusing, isTurning]);

  const modelRef = useRef();

  useLayoutEffect(() => {
    if (modelRef.current && processedScene) {
      modelRef.current.add(processedScene);
      return () => {
        if (modelRef.current && processedScene) {
          modelRef.current.remove(processedScene);
        }
      };
    }
  }, [processedScene]);

  useFrame((_, delta) => {
    if (!meshRef.current || !processedScene) return;
    const computedScale = processedScene.userData.computedScale || [1, 1, 1];
    const targetY = hovered ? 0.08 : 0;
    meshRef.current.position.setY(
      THREE.MathUtils.lerp(meshRef.current.position.y, targetY, delta * 6),
    );

    if (isPulsing) {
      const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.015;
      meshRef.current.scale.set(
        computedScale[0] * pulse,
        computedScale[1] * pulse,
        computedScale[2] * pulse,
      );
    } else {
      meshRef.current.scale.set(
        computedScale[0],
        computedScale[1],
        computedScale[2],
      );
    }
  });

  return (
    <group rotation={rotation}>
      <group
        ref={meshRef}
        onPointerOver={() => {
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <group ref={modelRef} dispose={null} />
      </group>
      {finalShowLights && (
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry
            args={[targetDims.length + 0.1, 0.025, targetDims.width + 0.1]}
          />
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={isPulsing ? 2 : 1}
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      )}
      {needsOp && (
        <HumanOperator
          id={id}
          rotation={0}
          isStanding={isStanding}
          isInspection={t.includes("inspection")}
        />
      )}

      {hovered && (
        <Html
          position={[0, targetDims.height + 1.2, 0]}
          center
          distanceFactor={15}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{
              background: "rgba(15, 23, 42, 0.95)",
              backdropFilter: "blur(12px)",
              color: "#fff",
              padding: "16px",
              borderRadius: "16px",
              fontSize: "11px",
              whiteSpace: "nowrap",
              border: `1px solid ${secColor}55`,
              boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              minWidth: "180px",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                opacity: 0.6,
                textTransform: "uppercase",
                letterSpacing: "2px",
                fontSize: "8px",
                fontWeight: "900",
              }}
            >
              <Settings size={10} style={{ color: secColor }} />
              {mType || "Unknown Machine"}
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "800",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                paddingBottom: "6px",
                marginBottom: "2px",
                color: "#f8fafc",
                maxWidth: '220px',
                wordBreak: 'break-word',
                lineHeight: 1.2
              }}
            >
              {opLabel && opLabel !== 'Unknown' ? opLabel : "Unknown Operation"}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: statusColor,
                  fontWeight: "900",
                  fontSize: "9px",
                  textTransform: "uppercase",
                }}
              >
                {statusColor === "#22c55e" ? (
                  <>✓ READY <span style={{ opacity: 0.6, marginLeft: '4px' }}>STYLE: {newStyle}</span></>
                ) : statusColor === "#f59e0b" ? (
                  "⚠ CHANGEOVER"
                ) : (
                  <>⚡ PRODUCING <span style={{ opacity: 0.6, marginLeft: '4px' }}>STYLE: {oldStyle}</span></>
                )}
              </span>
              <span
                style={{ color: "#fff", fontWeight: "800", fontSize: "9px" }}
              >
                SMV: {typeof smv === 'number' ? smv.toFixed(2) : (smv || "0.00")}
              </span>
              <span style={{ fontSize: "9px", color: "#818cf8", fontWeight: "900", background: "rgba(129, 140, 248, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
                ZONE: {section?.toUpperCase() || "LINE"}
              </span>
              <span style={{ opacity: 0.4, fontSize: "9px" }}>
                ID: {id.split("-").pop()}
              </span>
            </div>
          </motion.div>
        </Html>
      )}

      {/* CLOUD CARD FOR ALLOCATION */}
      {allocatedLine && (
        <Html position={[0, 0.6, 0]} transform={false} center>
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 0.75 }}
            style={{
              position: 'relative',
              background: "rgba(15, 23, 42, 0.98)",
              backdropFilter: "blur(8px)",
              padding: "2px 6px",
              borderRadius: "2px",
              border: "1px solid rgba(129, 140, 248, 0.6)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              color: "#fff",
              marginBottom: '6px' // For the pointer
            }}
          >
            <span
              style={{
                fontSize: "7px",
                fontWeight: "900",
                color: "#818cf8",
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}
            >
              LINE {allocatedLine.replace(/[^0-9]/g, "")}
            </span>
            <CheckCircle2 size={7} color="#10b981" />

            {/* POINTER TIP */}
            <div
              style={{
                position: 'absolute',
                bottom: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '0',
                height: '0',
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid rgba(129, 140, 248, 0.6)',
              }}
            />
          </motion.div>
        </Html>
      )}
    </group>
  );
};

const Ground = () => (
  <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
      <planeGeometry args={[2000, 2000]} />
      <meshStandardMaterial color="#1e293b" roughness={0.9} metalness={0.1} />
    </mesh>
    <gridHelper
      args={[2000, 400, "#334155", "#334155"]}
      position={[0, -1.0, 0]}
    />
  </group>
);

const WideBorder = ({ length, width, thickness = 0.1, color = "#fcd34d" }) => (
  <group position={[0, 0.015, 0]}>
    <mesh position={[0, 0, -width / 2 - thickness / 2]}>
      <boxGeometry args={[length + thickness * 2, 0.05, thickness]} />
      <meshStandardMaterial color={color} />
    </mesh>
    <mesh position={[0, 0, width / 2 + thickness / 2]}>
      <boxGeometry args={[length + thickness * 2, 0.05, thickness]} />
      <meshStandardMaterial color={color} />
    </mesh>
    <mesh position={[-length / 2 - thickness / 2, 0, 0]}>
      <boxGeometry args={[thickness, 0.05, width]} />
      <meshStandardMaterial color={color} />
    </mesh>
    <mesh position={[length / 2 + thickness / 2, 0, 0]}>
      <boxGeometry args={[thickness, 0.05, width]} />
      <meshStandardMaterial color={color} />
    </mesh>
  </group>
);

const SectionFloors = ({ generatedSections, activeSection }) => {
  if (!generatedSections || generatedSections.length === 0) return null;
  return (
    <group>
      {generatedSections.map((sec) => {
        const isSM = sec.name.toLowerCase().includes("supermarket");
        const sk = sec.name
          .replace(/ ab| cd/i, "")
          .trim()
          .toLowerCase();
        if (
          activeSection !== "All" &&
          activeSection.toLowerCase() !== sk &&
          !sk.includes(activeSection.toLowerCase())
        )
          return null;
        return (
          <group
            key={sec.id}
            position={[sec.position.x + sec.length / 2, 0, sec.position.z]}
          >
            {!isSM && (
              <>
                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.01, 0]}
                  receiveShadow
                >
                  <planeGeometry args={[sec.length, sec.width]} />
                  <meshStandardMaterial
                    color="#3b82f6"
                    roughness={0.8}
                    transparent
                    opacity={0.3}
                    emissive="#3b82f6"
                    emissiveIntensity={0.15}
                    polygonOffset
                    polygonOffsetFactor={1}
                    polygonOffsetUnits={1}
                    depthWrite={false}
                  />
                </mesh>
                <WideBorder
                  length={sec.length}
                  width={sec.width}
                  color="#fcd34d"
                />
                <Html
                  position={[0, 0.03, 0]}
                  center
                  transform
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <div
                    style={{
                      color: "#fff",
                      fontSize: "24px",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      letterSpacing: "0.4em",
                      opacity: 0.35,
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    {sec.name}
                  </div>
                </Html>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
};

/* ───── 3. MAIN COMPONENT ───── */

const formatSeconds = (sec) => {
  if (!sec) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
};

export default function WarRoom() {
  const [activeLines, setActiveLines] = useState([]);
  const [selectedLineId, setSelectedLineId] = useState("");
  const [activeLineLabel, setActiveLineLabel] = useState("");
  const [masterData, setMasterData] = useState([]);
  const [displayLayout, setDisplayLayout] = useState([]);
  const [sections, setSections] = useState([]);
  const [sections3D, setSections3D] = useState([]);
  const [activeSection, setActiveSection] = useState("All");
  const [assignmentOp, setAssignmentOp] = useState(null);


  // Helper: Normalize names for matching
  const normalizeLineName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizeOpName = (name) => (name || "").toString().toLowerCase().trim().replace(/[^\w\s]/gi, "").replace(/\s+/g, " ");

  const [meta, setMeta] = useState({
    style: "---",
    line: "---",
    con: "---",
    fromCon: "---",
    fromBuyer: "---",
    toBuyer: "---",
    fromStyle: "---",
  });
  const [obMetrics, setObMetrics] = useState({ totalSMV: "0.00", target: 0 });
  const [fromOps, setFromOps] = useState([]);
  const [idleMachineFilter, setIdleMachineFilter] = useState("");
  const [idleFloor, setIdleFloor] = useState("Floor 1");
  const [obRef, setObRef] = useState(null);
  const [fullObData, setFullObData] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const isLiveChangeover = useMemo(() => {
    return activeLines.some(
      (l) => (l.line || l.summaryData?.line) === activeLineLabel,
    );
  }, [activeLines, activeLineLabel]);

  // ─── Fetch Machine Availability (idle machines) natively ────────────────────
  const [gridData, setGridData] = useState([]);
  const [isLoadingGrid, setIsLoadingGrid] = useState(true);

  useEffect(() => {
    let active = true;

    // Load from cache initially for speed
    const cached = localStorage.getItem("warRoom_gridData");
    if (cached) {
      try {
        setGridData(JSON.parse(cached));
        setIsLoadingGrid(false);
      } catch (e) { }
    }

    const fetchProxyData = async () => {
      try {
        const resp = await axios.post(
          "https://us-central1-lagunaclothing-ishika.cloudfunctions.net/proxyWorksheetData",
          { organization_id: "lagunaclothing", worksheet_id: "oNJWCZE9" }
        );
        if (active) {
          const data = resp.data.data || [];
          setGridData(data);
          setIsLoadingGrid(false);
          localStorage.setItem("warRoom_gridData", JSON.stringify(data));
        }
      } catch (e) {
        if (active) {
          setIsLoadingGrid(false);
          console.error("Failed to fetch machine grid data", e);
        }
      }
    };

    fetchProxyData();
    const interval = setInterval(fetchProxyData, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const idleMachines = useMemo(() => {
    return gridData.filter((m) => {
      const sec = (m.final_section || m.section || "").toUpperCase();
      return sec.includes("IDLE");
    });
  }, [gridData]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);


  const [viewMode, setViewMode] = useState("today"); // "today" or "lastSession"

  useEffect(() => {
    let isMounted = true;
    let unsub = null;

    const q = collection(db, "changeoverData");
    unsub = onSnapshot(q, (snap) => {
      if (!isMounted) return;
      const allLines = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 1. Extract all unique dates from the data
      const datesSet = new Set();
      const today = new Date();
      const todayDateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      const altTodayDateStr = todayDateStr.split('/').map(p => parseInt(p, 10).toString()).join('/');

      allLines.forEach(l => {
        const dStr = l.lastUpdated || l.summaryData?.lastUpdated || "";
        const match = dStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
          const norm = `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`;
          datesSet.add(norm);
        }
      });

      // 2. Sort dates descending
      const sortedDates = Array.from(datesSet).sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db, mb, yb] = b.split('/').map(Number);
        return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
      });

      // 3. Determine target date
      let targetDateStr = todayDateStr;
      if (viewMode === "lastSession") {
        const beforeToday = sortedDates.filter(d => {
          const [day, month, year] = d.split('/').map(Number);
          return new Date(year, month - 1, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
        });
        targetDateStr = (beforeToday.length > 0) ? beforeToday[0] : (sortedDates[1] || "NONE");
      }

      const parts = targetDateStr.split('/');
      const altTargetDateStr = parts.map(p => parseInt(p, 10).toString()).join('/');

      const filtered = allLines.filter((l) => {
        if (targetDateStr === "NONE") return false;
        const dStr = l.lastUpdated || l.summaryData?.lastUpdated || "";
        if (!(dStr.includes(targetDateStr) || dStr.includes(altTargetDateStr))) return false;

        if (viewMode === "today") {
          const status = (l.status || "").toLowerCase();
          return (status === 'partial' || status === 'in_progress');
        }
        return true;
      });

      setActiveLines(filtered.sort((a, b) => {
         const dA = new Date(a.lastUpdated || a.summaryData?.lastUpdated || 0).getTime();
         const dB = new Date(b.lastUpdated || b.summaryData?.lastUpdated || 0).getTime();
         return dB - dA;
      }));
    });

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [viewMode]);

  useEffect(() => {
    const currentInList = activeLines.find(l => l.id === activeLineLabel || (l.line || l.summaryData?.line) === activeLineLabel);
    if (!currentInList) {
      if (activeLines.length > 0) {
        // Pick the first available one in the new mode
        setActiveLineLabel(activeLines[0].id || activeLines[0].line || activeLines[0].summaryData?.line);
      } else {
        // Clear selection if no data for this mode
        setActiveLineLabel("");
        setSelectedLineId("");
      }
    }
  }, [activeLines]);


  useEffect(() => {
    const active = activeLines.find(
      (l) => (l.line || l.summaryData?.line) === activeLineLabel,
    );
    if (active) setSelectedLineId(active.id);
    else setSelectedLineId("");
  }, [activeLineLabel, activeLines]);

  useEffect(() => {
    const fetchMetadata = async () => {
      if (!activeLineLabel) return;
      
      // Search by ID or Line Name
      let currentLine = activeLines.find(
        (l) => l.id === activeLineLabel || (l.line || l.summaryData?.line) === activeLineLabel,
      );
      
      if (!currentLine) {
        // Fallback for direct searches or URL params
        const q = query(
          collection(db, "activeLines"),
          where("line", "in", [activeLineLabel, activeLineLabel.toUpperCase()]),
          limit(1)
        );
        const qSnap = await getDocs(q);
        if(!qSnap.empty) {
            currentLine = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
        }
      }

      if (!currentLine) {
        const q = query(
          collection(db, "changeoverData"),
          where("line", "in", [activeLineLabel, activeLineLabel.toUpperCase()]),
          where("docType", "==", "summary"),
          limit(50),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          currentLine = docs.sort(
            (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
          )[0];
        }
      }
      if (!currentLine) {
        console.log("[WarRoom Debug] currentLine is still undefined after fallbacks, setting '---'");
        setMeta({
          style: "---",
          line: activeLineLabel,
          con: "---",
          fromBuyer: "---",
          toBuyer: "---",
          fromStyle: "---",
        });
        return;
      }
      
      console.log("[WarRoom Debug] Resolving metadata for currentLine:", currentLine);
      const con = String(
        currentLine.conNumber ||
        currentLine.summaryData?.conNumber ||
        currentLine.conNo ||
        currentLine.summaryData?.conNo ||
        currentLine.con ||
        currentLine.summaryData?.con ||
        "",
      ).trim();

      // Resolve style — check every possible field name that different doc versions use
      const resolveStyle = (src) =>
        src?.toStyle ||
        src?.style ||
        src?.styleCode ||
        src?.styleName ||
        src?.uploadStyle ||
        src?.styleNo ||
        src?.style_no ||
        null;

      let styleVal = resolveStyle(currentLine) || resolveStyle(currentLine.summaryData);

      // Fallback: If style is missing but we have CON, fetch from styleOBmetadata (like Overview does)
      if (!styleVal && con && con !== "---") {
        try {
          console.log(`[WarRoom Debug] Fallback lookup for CON: ${con}`);
          const metaQ = query(
            collection(db, "styleOBmetadata"),
            where("conNo", "==", con),
            limit(1)
          );
          const metaSnap = await getDocs(metaQ);
          if (!metaSnap.empty) {
            const md = metaSnap.docs[0].data();
            styleVal = md.styleName || md.uploadStyle || md.style || md.styleCode;
            console.log(`[WarRoom Debug] Found style via fallback: ${styleVal}`, md);
          } else {
            console.log(`[WarRoom Debug] No styleOBmetadata found for CON: ${con}`);
          }
        } catch (e) {
          console.warn("[WarRoom] Failed to fetch fallback style name:", e);
        }
      }
      styleVal = styleVal || "---";

      console.log(`[WarRoom Debug] Final styleVal=${styleVal}, con=${con}`);

      const fromStyleVal = currentLine.fromStyle || currentLine.summaryData?.fromStyle ||
                           currentLine.previousStyle || currentLine.summaryData?.previousStyle || "---";
      const lineVal = currentLine.line || currentLine.summaryData?.line ||
                      currentLine.lineNo || currentLine.summaryData?.lineNo ||
                      (activeLineLabel?.includes('Line') ? activeLineLabel : 'Line 1');

      const nextMeta = {
        style: styleVal,
        fromStyle: fromStyleVal,
        line: lineVal,
        con,
        fromCon: currentLine.fromCon || currentLine.summaryData?.fromCon || "---",
        fromBuyer: currentLine.fromBuyer || currentLine.summaryData?.fromBuyer || "---",
        toBuyer: currentLine.toBuyer || currentLine.summaryData?.toBuyer || "---",
      };

      // Only update if values actually changed to prevent downstream effect ripple
      setMeta(prev => {
        const isSame = prev.style === nextMeta.style &&
                       prev.fromStyle === nextMeta.fromStyle &&
                       prev.line === nextMeta.line &&
                       prev.con === nextMeta.con;
        return isSame ? prev : nextMeta;
      });

      const fromStyleName =
        currentLine.fromStyle || currentLine.summaryData?.fromStyle || "---";
      setFromOps([]);
      if (fromStyleName !== "---") {
        let qFrom = query(
          collection(db, "styleOBmetadata"),
          where("uploadStyle", "==", fromStyleName),
          limit(1),
        );
        let snapFrom = await getDocs(qFrom);

        // Fallback for From Style: Try by CON if we have it in summary (rare)
        if (snapFrom.empty) {
          const fromCon =
            currentLine.fromCon || currentLine.summaryData?.fromCon;
          if (fromCon) {
            qFrom = query(
              collection(db, "styleOBmetadata"),
              where("conNo", "==", fromCon),
              limit(1),
            );
            snapFrom = await getDocs(qFrom);
          }
        }

        if (!snapFrom.empty) {
          const fromDocData = snapFrom.docs[0].data();
          const fromData = fromDocData.parsedOBData || {};
          let flattenedFrom = [];
          const extractFrom = (data, inheritedSection) => {
            if (!data) return;
            if (Array.isArray(data)) {
              data.forEach((item) => extractFrom(item, inheritedSection));
            } else if (typeof data === "object") {
              const sec = data.section || data.sectionName || data.name || inheritedSection || "General";
              if (Array.isArray(data.operations)) {
                data.operations.forEach(op => {
                   const opName = op.op_name || op.operation || "";
                   if (opName && !isTotalOpName(opName)) {
                     flattenedFrom.push({ ...op, section: sec, op_name: opName });
                   }
                });
              } else if (data.operation || data.op_name) {
                 const opName = data.op_name || data.operation || "";
                 if (opName && !isTotalOpName(opName)) {
                   flattenedFrom.push({ ...data, section: sec, op_name: opName });
                 }
              } else {
                 Object.values(data).forEach(val => extractFrom(val, sec));
              }
            }
          };
          extractFrom(fromData, "General");

          // Correct SMVs using Excel fileUrl if available
          let fromFileUrl = fromDocData.fileUrl || fromDocData.obFileUrl;
          
          if (!fromFileUrl) {
            console.log("[WarRoom Debug] fileUrl missing on styleOBmetadata, checking past changeoverData for fromStyle:", fromStyleName);
            try {
              const pastQ = query(
                collection(db, "changeoverData"),
                where("line", "in", [activeLineLabel, activeLineLabel.toUpperCase(), (meta.line || "Line 1")]),
                where("docType", "==", "summary"),
                limit(10)
              );
              const pastSnap = await getDocs(pastQ);
              const pastDoc = pastSnap.docs.find(d => {
                const data = d.data();
                const sty = data.toStyle || data.style || data.summaryData?.toStyle || data.summaryData?.style;
                return sty === fromStyleName && data.fileUrl;
              });
              if (pastDoc) {
                fromFileUrl = pastDoc.data().fileUrl;
                console.log("[WarRoom Debug] Found fromFileUrl in past changeoverData:", fromFileUrl);
              }
            } catch(e) {
               console.warn("[WarRoom] Failed to find historical fromStyle fileUrl", e);
            }
          }

          console.log("[WarRoom Debug] fromDocData keys:", Object.keys(fromDocData), "resolved fileUrl:", fromFileUrl);
          if (fromFileUrl) {
            try {
              console.log("[WarRoom] Parsing SMV from fromOps OB file:", fromFileUrl);
              const excelSMVMap = await parseSMVFromOBFile(fromFileUrl);
              // Clone map so we can shift without destroying cache for other uses
              const localMap = excelSMVMap ? JSON.parse(JSON.stringify(excelSMVMap)) : null;
              if (localMap && Object.keys(localMap).length > 0) {
                flattenedFrom.forEach(op => {
                  const key = normalizeKey(op.op_name || '');
                  if (localMap[key] && localMap[key].length > 0) {
                    op.smv = localMap[key].shift().smv;
                  } else {
                    const fuzzyKey = Object.keys(localMap).find(k =>
                      localMap[k].length > 0 &&
                      ((k.length >= 5 && (key.startsWith(k.slice(0,5)) || k.startsWith(key.slice(0,5)))) ||
                      key.includes(k) || k.includes(key))
                    );
                    if (fuzzyKey) op.smv = localMap[fuzzyKey].shift().smv;
                  }
                });
              }
            } catch (e) {
              console.warn("[WarRoom] Failed to parse fromOps Excel SMV:", e);
            }
          }

          // Fallback: Make sure every op has an SMV even if fileUrl failed
          flattenedFrom.forEach(op => {
             if (op.smv === undefined || isNaN(op.smv)) {
               op.smv = extractOpSMV(op) || 0;
             }
          });

          setFromOps(flattenedFrom);
        }
      }
    };
    fetchMetadata();
  }, [activeLineLabel, activeLines]);

  useEffect(() => {
    // Clear data immediately whenever dependencies change
    setMasterData([]);
    setFullObData(null);
    setSections([]);
    setSections3D([]);

    if (
      (!meta.con || meta.con === "---") &&
      (!meta.style || meta.style === "---")
    )
      return;
    let unsub = null;
    const findAndListen = async () => {
      // Data already cleared above

      // Try by CON Number first
      let q = query(
        collection(db, "styleOBmetadata"),
        where("conNo", "==", meta.con),
        limit(1),
      );
      let snap = await getDocs(q);

      // Fallback: Try by Style Name
      if (snap.empty && meta.style && meta.style !== "---") {
        q = query(
          collection(db, "styleOBmetadata"),
          where("style", "==", meta.style),
          limit(1),
        );
        snap = await getDocs(q);
        
        if (snap.empty) {
          q = query(
            collection(db, "styleOBmetadata"),
            where("uploadStyle", "==", meta.style),
            limit(1),
          );
          snap = await getDocs(q);
        }
      }

      if (!snap.empty) {
        setObRef(snap.docs[0].ref);
        unsub = onSnapshot(snap.docs[0].ref, async (docSnap) => {
          const foundData = docSnap.data();
          if (!foundData) return;
          setFullObData(foundData);

          let ops = [];

          // ── Step 1: Backend SQLite /get-ob (primary – has real parsed SMVs) ──
          try {
            const lineStr = (meta.line || "Line 1").trim();
            const styleStr = (meta.style || "").trim();
            const conStr = (meta.con && meta.con !== "---") ? meta.con.trim() : "";
            const backendUrl = `${API_BASE_URL}/get-ob?line_no=${encodeURIComponent(lineStr)}&style_no=${encodeURIComponent(styleStr)}${conStr ? `&con_no=${encodeURIComponent(conStr)}` : ""}`;
            const resp = await axios.get(backendUrl);
            const backendOps = resp.data?.operations;
            if (Array.isArray(backendOps) && backendOps.length > 0) {
              ops = backendOps
                .filter(op => {
                  const name = (op.op_name || "").toLowerCase();
                  const smvVal = parseFloat(op.smv) || 0;
                  // Skip ignored ops, zero-SMV ops, and total/subtotal rows that leaked through
                  return !IGNORED_OPS.some(p => name.includes(p))
                    && smvVal > 0
                    && smvVal < 15  // per-op SMV cap: subtotals are always > 15 in a garment OB
                    && !TOTAL_ROW_PATTERNS.some(p => p.test(op.op_name || ''));
                })
                .map(op => {
                  const rawMachine = op.machine_type || op.machine || "";
                  const machineType = MACHINE_NORMALISATION[normalizeKey(rawMachine)] || rawMachine || "SNLS";
                  return { ...op, machine_type: machineType, smv: parseFloat(op.smv) || 0 };
                });
              console.log(`[WarRoom] Backend OB: ${ops.length} ops, totalSMV=${ops.reduce((s,o) => s+(o.smv||0), 0).toFixed(2)}`);
            }
          } catch (backendErr) {
            console.warn("[WarRoom] Backend /get-ob failed, falling back to Firestore:", backendErr?.message);
          }

          // ── Step 2: Firestore fallback — always re-parse SMV from uploaded Excel file ──
          if (ops.length === 0) {
            const parsedOB = foundData.parsedOBData || {};

            // Step 2a: Try to get correct SMVs straight from the Excel source (fileUrl)
            // This is the ONLY reliable source — Firestore parsedOBData often contains
            // subtotal rows that inflate the totalSMV (e.g. 92 instead of 31)
            let excelSMVMap = null;
            if (foundData.fileUrl) {
              console.log("[WarRoom] Parsing SMV from uploaded OB file:", foundData.fileUrl);
              excelSMVMap = await parseSMVFromOBFile(foundData.fileUrl);
              if (excelSMVMap && Object.keys(excelSMVMap).length > 0) {
                const totalExcel = Object.values(excelSMVMap).flat().reduce((s,v)=>s+v.smv, 0);
                console.log(`[WarRoom] Excel SMV map: ${Object.values(excelSMVMap).flat().length} ops, totalSMV=${totalExcel.toFixed(2)}`);
              }
            }

            // Step 2b: Extract ops from Firestore for structure (section, machine_type, op_name)
            const deepExtract = (node, inheritedSection) => {
              if (!node) return;
              if (Array.isArray(node)) { node.forEach(item => deepExtract(item, inheritedSection)); return; }
              if (typeof node !== "object") return;
              const nodeSection = node.section || node.sectionName || node.name || inheritedSection || "General";
              if (Array.isArray(node.operations)) {
                node.operations.forEach(op => {
                  const opName = extractOpName(op);
                  if (!opName) return;
                  if (IGNORED_OPS.some(p => opName.toLowerCase().includes(p))) return;
                  if (isTotalOpName(opName)) return; // skip subtotal/total rows
                  const rawSMV = extractOpSMV(op);
                  const rawMachine = op.machine_type || op.machine || "";
                  const machineType = MACHINE_NORMALISATION[normalizeKey(rawMachine)] || rawMachine || "SNLS";
                  ops.push({
                    ...op,
                    section: (op.section || nodeSection).trim(),
                    op_name: opName,
                    machine_type: machineType,
                    smv: rawSMV || 0,  // will be replaced from excelSMVMap below
                  });
                });
                return;
              }
              const rawSMV = extractOpSMV(node);
              const opName = extractOpName(node);
              if (opName && !IGNORED_OPS.some(p => opName.toLowerCase().includes(p)) && !isTotalOpName(opName)) {
                const rawMachine = node.machine_type || node.machine || "";
                const machineType = MACHINE_NORMALISATION[normalizeKey(rawMachine)] || rawMachine || "SNLS";
                ops.push({ ...node, section: (node.section || inheritedSection || "General").trim(), op_name: opName, machine_type: machineType, smv: rawSMV || 0 });
                return;
              }
              Object.entries(node).forEach(([key, val]) => {
                if (["section","sectionName","smv","sam","op_no","op_name","machine_type"].includes(key)) return;
                const kl = key.toLowerCase();
                const childSec = kl.includes("collar") ? "Collar" : kl.includes("cuff") ? "Cuff" : kl.includes("sleeve") ? "Sleeve" : kl.includes("back") ? "Back" : kl.includes("front") ? "Front" : (kl.includes("assembly") || kl.includes("joining") || kl.includes("sewing")) ? "Assembly" : nodeSection;
                deepExtract(val, childSec);
              });
            };
            deepExtract(parsedOB, "General");

            // Step 2c: Replace ALL SMV values with Excel-parsed values (source of truth)
            if (excelSMVMap && Object.keys(excelSMVMap).length > 0) {
              // CLONE the cache map so shift() doesn't destroy the cache for future re-renders!
              const localMap = JSON.parse(JSON.stringify(excelSMVMap));
              ops.forEach(op => {
                const key = normalizeKey(op.op_name || '');
                // Exact match
                if (localMap[key] && localMap[key].length > 0) {
                  op.smv = localMap[key].shift().smv;
                  return;
                }
                // Prefix/suffix fuzzy match
                const fuzzyKey = Object.keys(localMap).find(k =>
                  localMap[k].length > 0 &&
                  ((k.length >= 5 && (key.startsWith(k.slice(0,5)) || k.startsWith(key.slice(0,5)))) ||
                  key.includes(k) || k.includes(key))
                );
                if (fuzzyKey) {
                  op.smv = localMap[fuzzyKey].shift().smv;
                  return;
                }
                // No match → mark for removal (this op was a subtotal/ghost row in Firestore)
                op.smv = 0;
              });

              // If we got good coverage from Excel, drop unmatched ops (they were subtotals)
              const matchedCount = ops.filter(o => o.smv > 0).length;
              if (matchedCount > ops.length * 0.4) {
                // More than 40% matched → trust the filter, drop unmatched
                ops = ops.filter(o => o.smv > 0);
              }
            } else {
              // No Excel file — apply caps to filter out obvious subtotal rows
              ops = ops.filter(o => {
                const s = o.smv || 0;
                return s > 0 && s < 15 && !isTotalOpName(o.op_name || '');
              });
            }

            console.log(`[WarRoom] Firestore OB: ${ops.length} ops, totalSMV=${ops.reduce((s,o)=>s+(o.smv||0),0).toFixed(2)} (sections: ${[...new Set(ops.map(o => o.section))].join(", ")})`);
          }

          if (ops.length === 0) {
            console.warn("[WarRoom] No ops found for style:", meta.style, "con:", meta.con);
            return;
          }

          // ── Generate layout (same as Floor View) ──
          const result = generateVirtualFloorLayout(ops, meta.line || "Line 1");
          setMasterData(result.machines);
          setObMetrics({
            totalSMV: (result.totalSMV || 0).toFixed(2),
            target: result.target,
          });
          const standardSections = ["Collar", "Cuff", "Sleeve", "Back", "Front", "Assembly"];
          const foundSections = result.machines.map((m) => {
             const s = m.section || "";
             if (s.toLowerCase().includes("assembly") || s.toLowerCase().includes("lane")) return "Assembly";
             return s;
          }).filter(Boolean);
          const uniqueSections = [...new Set([...standardSections, ...foundSections])];
          setSections(uniqueSections.filter(s => !s.toLowerCase().includes("assembly") || s === "Assembly"));
          const { specs: s, sections: se } = getLayoutSpecs(meta.line || "Line 1");
          const allSecs = [
            { id: `c`, name: `Cuff`, length: se.cuff.end - se.cuff.start, width: s.widthAB, position: { x: se.cuff.start, y: 0, z: LANE_Z_CENTER_AB }, color: "#f06b43" },
            { id: `s`, name: `Sleeve`, length: se.sleeve.end - se.sleeve.start, width: s.widthAB, position: { x: se.sleeve.start, y: 0, z: LANE_Z_CENTER_AB }, color: "#f06b43" },
            { id: `b`, name: `Back`, length: se.back.end - se.back.start, width: s.widthAB, position: { x: se.back.start, y: 0, z: LANE_Z_CENTER_AB }, color: "#f06b43" },
            { id: `cl`, name: `Collar`, length: se.collar.end - se.collar.start, width: s.widthCD, position: { x: se.collar.start, y: 0, z: LANE_Z_CENTER_CD }, color: "#14b8a6" },
            { id: `f`, name: `Front`, length: se.front.end - se.front.start, width: s.widthCD, position: { x: se.front.start, y: 0, z: LANE_Z_CENTER_CD }, color: "#14b8a6" },
            { id: `a1`, name: `Assembly AB`, length: se.assemblyAB.end - se.assemblyAB.start, width: s.widthAB, position: { x: se.assemblyAB.start, y: 0, z: LANE_Z_CENTER_AB }, color: "#f06b43" },
            { id: `a2`, name: `Assembly CD`, length: se.assemblyCD.end - se.assemblyCD.start, width: s.widthCD, position: { x: se.assemblyCD.start, y: 0, z: LANE_Z_CENTER_CD }, color: "#14b8a6" }
          ];
          setSections3D(allSecs);
        });
      }
    };
    findAndListen();
    return () => { if(unsub) unsub(); };
  }, [meta.style, meta.con, meta.line, viewMode]);

  // ─── Operation Card Renderer ───────────────────────
  const renderOperationCard = (opData, idx, isExternal) => {
    const op = opData.operation || opData;
    const opLabel = extractOpName(opData) || extractOpName(op) || "Unknown Operation";
    
    const isArranged = ["RUNNING", "CHANGEOVER_DONE", "QC_APPROVED"].includes(op.qcStatus);
    const assignedMc = isArranged
      ? gridData.find((m) => m.mc_serial_no === op.assignedMachineSerial)
      : null;
    const sourceLine = assignedMc
      ? assignedMc.final_new_line || assignedMc.line || assignedMc["Current Line"] || "Buffer"
      : null;

    return (
      <div
        key={opData.uniqueKey || idx}
        style={{
          padding: "14px",
          background: op.machineArranged === "Yes" ? "rgba(34, 197, 94, 0.05)" : "rgba(30, 41, 59, 0.4)",
          borderRadius: "14px",
          border: op.machineArranged === "Yes" ? "1px solid rgba(34, 197, 94, 0.2)" : "1px solid rgba(255,255,255,0.03)",
          transition: "all 0.3s ease",
        }}
      >
        <div style={{ marginBottom: "8px" }}>
          <div style={{ color: "#f8fafc", fontSize: "11px", fontWeight: "bold" }}>
            {opLabel}
          </div>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "9px",
              fontWeight: "800",
              marginTop: "3px",
              textTransform: "uppercase",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{op.machine || op.machine_type}</span>
            <span style={{ color: "#fff", opacity: 0.6 }}>
              SMV: {typeof op.smv === "number" ? op.smv.toFixed(2) : op.smv || "0.00"}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "8px",
            background: "rgba(0,0,0,0.2)",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.03)",
          }}
        >
          {/* MC ALLOCATED DISPLAY */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900" }}>MC ALLOCATED:</span>
            <span style={{ fontSize: "9px", fontWeight: "900", color: op.machineArranged === "Yes" ? "#10b981" : "#94a3b8" }}>
              {op.machineArranged === "Yes" ? "YES" : "NO"}
            </span>
          </div>

          {/* TIME TAKEN DISPLAY */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: "4px",
            }}
          >
            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900" }}>TIME TAKEN:</span>
            <span style={{ fontSize: "9px", fontWeight: "900", color: "#fff", opacity: 0.8 }}>
              {formatSeconds(op.totalTimeSeconds)}
            </span>
          </div>

          {/* REASON DISPLAY / INPUT */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              paddingTop: "6px",
            }}
          >
            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900", textTransform: "uppercase" }}>
              Reason for Delay if any:
            </span>
            {(() => {
              const rawReason = op.reasonForDelay?.trim() || "";
              const displayReason = (rawReason.toUpperCase() === "OTHERS" && op.otherReason?.trim())
                ? `OTHERS - ${op.otherReason.trim().toUpperCase()}`
                : rawReason;

              return (
                <input
                  key={`${op.uniqueKey}-${displayReason}`}
                  type="text"
                  placeholder=""
                  defaultValue={displayReason}
                  onBlur={async (e) => {
                    const newVal = e.target.value;
                    if (!obRef || !fullObData) return;
                    if (newVal === displayReason) return;
                    let reasonForDelay = newVal;
                    let otherReason = "";
                    if (newVal.toUpperCase().startsWith("OTHERS - ")) {
                      reasonForDelay = "OTHERS";
                      otherReason = newVal.substring(9).trim();
                    }
                    const newFullData = JSON.parse(JSON.stringify(fullObData));
                    let matchFound = false;
                    if (newFullData.parsedOBData) {
                      Object.values(newFullData.parsedOBData).forEach((group) => {
                        if (Array.isArray(group)) {
                          group.forEach((sec) => {
                            if (sec.operations && Array.isArray(sec.operations)) {
                              sec.operations.forEach((o) => {
                                if (normalizeOpName(o.operation) === normalizeOpName(op.operation || op.op_name)) {
                                  o.reasonForDelay = reasonForDelay;
                                  o.otherReason = otherReason;
                                  matchFound = true;
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                    if (matchFound) {
                      setFullObData(newFullData);
                      try { await updateDoc(obRef, { parsedOBData: newFullData.parsedOBData }); }
                      catch (err) { console.error("Firebase update failed:", err); }
                    }
                  }}
                  style={{
                    background: displayReason ? "rgba(245, 158, 11, 0.1)" : "rgba(0,0,0,0.3)",
                    border: displayReason ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "4px",
                    padding: "6px 8px",
                    fontSize: "9px",
                    color: displayReason ? "#fbbf24" : "#fff",
                    fontWeight: displayReason ? "bold" : "normal",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                    transition: "all 0.3s ease"
                  }}
                />
              );
            })()}
          </div>

          {/* SOURCE LINE DROPDOWN (Strictly for External) */}
          {isExternal && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: "4px",
              }}
            >
              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900" }}>FROM LINE:</span>
              <div style={{ width: "80px" }}>
                <Select
                  className="war-room-select"
                  classNamePrefix="rs-select"
                  options={liveLineOptions}
                  placeholder="Select"
                  value={
                    op.allocatedLine
                      ? { value: op.allocatedLine, label: op.allocatedLine }
                      : sourceLine && sourceLine !== "Buffer"
                        ? { value: sourceLine, label: sourceLine }
                        : null
                  }
                  onChange={async (sel) => {
                    const newVal = sel?.value || "";
                    if (!obRef || !fullObData) return;
                    const newFullData = JSON.parse(JSON.stringify(fullObData));
                    let matchFound = false;
                    if (newFullData.parsedOBData) {
                      Object.values(newFullData.parsedOBData).forEach((group) => {
                        if (Array.isArray(group)) {
                          group.forEach((sec) => {
                            if (sec.operations && Array.isArray(sec.operations)) {
                              sec.operations.forEach((o) => {
                                if (normalizeOpName(o.operation) === normalizeOpName(op.operation || op.op_name)) {
                                  o.allocatedLine = newVal;
                                  matchFound = true;
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                    if (matchFound) {
                      setFullObData(newFullData);
                      try { await updateDoc(obRef, { parsedOBData: newFullData.parsedOBData }); }
                      catch (err) { console.error("Firebase update failed:", err); }
                    }
                  }}
                  styles={{
                    menu: (base) => ({ ...base, background: "#1e293b", fontSize: "10px" }),
                    option: (base, state) => ({ ...base, background: state.isFocused ? "#334155" : "transparent", color: "#fff" }),
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Comparative OB memoization ────────────────────
  const { externalOps, internalOps } = useMemo(() => {
    if (!masterData || masterData.length === 0 || !fromOps) return { externalOps: [], internalOps: [] };

    const ops = [];
    const seen = new Set();
    masterData.forEach(m => {
       const key = m.op_name || m.operation || m.uniqueKey;
       if (key && !seen.has(key)) {
          ops.push(m);
          seen.add(key);
       }
    });

    const { external, internal } = compareOBs(fromOps, ops);

    // Keep them strictly separated as per user request
    const externalRes = external;
    const internalRes = internal;

    return {
      externalOps: externalRes,
      internalOps: internalRes,
    };
  }, [masterData, fromOps, activeSection]);

  const sceneCenter = useMemo(() => {
    if (!sections3D || !sections3D.length) return [0, 0, 0];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    sections3D.forEach(s => {
      const x = s.position.x;
      const z = s.position.z;
      const l = s.length || 10;
      const w = s.width || 10;
      if (x < minX) minX = x;
      if (x + l > maxX) maxX = x + l;
      if (z - w / 2 < minZ) minZ = z - w / 2;
      if (z + w / 2 > maxZ) maxZ = z + w / 2;
    });
    const center = [(minX + maxX) / 2, 0.5, (minZ + maxZ) / 2];
    if (isNaN(center[0]) || isNaN(center[2])) return [0, 0.5, 0];
    return center;
  }, [sections3D]);

  const totalReadyGlobal = useMemo(() => {
    return (masterData || []).filter((m) => {
      const type = (m.operation?.machine_type || m.operation?.machine || "").toLowerCase();
      const isActual = !type.includes("inspection") && 
                       !type.includes("supermarket") && 
                       !type.includes("helper");
      return (
        isActual &&
        (m.operation?.qcStatus === "QC_APPROVED" ||
          m.operation?.machineArranged === "Yes")
      );
    }).length;
  }, [masterData]);

  const globalTotalMachines = useMemo(() => {
    return (masterData || []).filter((m) => {
      const type = (m.operation?.machine_type || m.operation?.machine || "").toLowerCase();
      return !type.includes("inspection") && 
             !type.includes("supermarket") && 
             !type.includes("helper");
    }).length;
  }, [masterData]);

  const updateDisplayLayout = (data, sectionName) => {
    setActiveSection(sectionName);
    if (!sectionName || sectionName === "All") {
      setDisplayLayout(data);
    } else {
      setDisplayLayout(
        data.filter((m) =>
          (m.section || "").toLowerCase().includes(sectionName.toLowerCase()),
        ),
      );
    }
  };

  useEffect(() => {
    updateDisplayLayout(masterData, activeSection);
  }, [masterData, activeSection]);

  const handleAssignMachine = async (op, mc) => {
    if (!obRef || !fullObData) return;
    const newParsedOB = JSON.parse(
      JSON.stringify(fullObData.parsedOBData || {}),
    );
    Object.values(newParsedOB).forEach((group) => {
      if (Array.isArray(group))
        group.forEach((b) =>
          (b.operations || []).forEach((o) => {
            if (o.op_no === op.op_no) {
              o.machineArranged = "Yes";
              o.assignedMachineSerial = mc.mc_serial_no;
            }
          }),
        );
    });
    await updateDoc(obRef, { parsedOBData: newParsedOB });
    setAssignmentOp(null);
  };

  const handleUnassignMachine = async (op) => {
    if (!obRef || !fullObData) return;
    const newParsedOB = JSON.parse(
      JSON.stringify(fullObData.parsedOBData || {}),
    );
    Object.values(newParsedOB).forEach((group) => {
      if (Array.isArray(group))
        group.forEach((b) =>
          (b.operations || []).forEach((o) => {
            if (o.op_no === op.op_no) {
              o.machineArranged = "No";
              o.assignedMachineSerial = "";
            }
          }),
        );
    });
    await updateDoc(obRef, { parsedOBData: newParsedOB });
  };

  const floor1Lines = [
    "LINE 1",
    "LINE 2",
    "LINE 3",
    "LINE 4",
    "LINE 5",
    "LINE 6",
    "LINE 7",
    "LINE 8",
    "LINE 9",
  ];
  const liveLineOptions = useMemo(() => {
    return activeLines.map(l => {
      const ln = l.line || l.summaryData?.line || "---";
      return { value: ln, label: ln };
    });
  }, [activeLines]);
  const yesNoOptions = [{ value: "Yes", label: "YES" }, { value: "No", label: "NO" }];

  const { floorLines, groupedIdle, totalIdle } = useMemo(() => {
    const idleAll = gridData.filter((m) => {
      const sec = (m.final_section || "").toUpperCase();
      return sec.includes("IDLE");
    });

    const floor2Lines = ["2ND FLOOR"];
    const lines = idleFloor === "Floor 1" ? floor1Lines : floor2Lines;

    const filterLow = idleMachineFilter.toLowerCase();
    const grouped = {};
    lines.forEach((ln) => {
      grouped[ln] = [];
    });

    idleAll.forEach((m) => {
      const id = (m.machine_id || "").toLowerCase();
      const op = (m.operation || "").toLowerCase();
      const serial = (m.mc_serial_no || m.serial_no || "").toLowerCase();
      const matchesFilter =
        !filterLow ||
        id.includes(filterLow) ||
        op.includes(filterLow) ||
        serial.includes(filterLow);

      if (!matchesFilter) return;

      let lnStr = (m.final_new_line || m.line || "")
        .toString()
        .toUpperCase()
        .trim();
      if (lnStr.includes("2ND FLOOR")) lnStr = "2ND FLOOR";
      else if (lnStr.includes("GROUND FLOOR")) lnStr = "GROUND FLOOR";
      else {
        const lnNum = lnStr.replace(/[^\d]/g, "");
        if (lnNum) lnStr = `LINE ${lnNum}`;
      }

      if (grouped[lnStr] !== undefined) {
        grouped[lnStr].push(m);
      }
    });

    // Sub-aggregate by machine name within each line
    const groupedHandled = {};
    lines.forEach((ln) => {
      const list = grouped[ln];
      const aggregated = {};
      list.forEach((m) => {
        const name = getCleanMachineName(m);
        if (!aggregated[name]) aggregated[name] = [];
        aggregated[name].push(m);
      });
      groupedHandled[ln] = aggregated;
    });

    return {
      floorLines: lines,
      groupedIdle: groupedHandled,
      totalIdle: idleAll.length,
    };
  }, [gridData, idleFloor, idleMachineFilter]);

  const filterLow = idleMachineFilter.toLowerCase();

  return (
    <>
    {/* Status Legend - position:fixed, never rotates with 3D scene */}
    <div style={{
      position: "fixed",
      bottom: "20px",
      left: "650px",
      background: "rgba(10,15,25,0.92)",
      border: "1px solid rgba(255,255,255,0.12)",
      padding: "10px 14px",
      borderRadius: "10px",
      zIndex: 99999,
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: "10px",
      color: "#fff",
      pointerEvents: "none",
      userSelect: "none",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <div style={{ width: "10px", height: "10px", background: "#ef4444", borderRadius: "3px", flexShrink: 0 }} />
        <span>PRODUCING</span>
        <span style={{ opacity: 0.45, fontSize: "8px" }}>({meta.fromStyle})</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <div style={{ width: "10px", height: "10px", background: "#f59e0b", borderRadius: "3px", flexShrink: 0 }} />
        <span>CHANGEOVER</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <div style={{ width: "10px", height: "10px", background: "#22c55e", borderRadius: "3px", flexShrink: 0 }} />
        <span>READY</span>
        <span style={{ opacity: 0.45, fontSize: "8px" }}>({meta.style})</span>
      </div>
    </div>
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: DASHBOARD_THEME.mainBg,
        display: "flex",
        flexDirection: "column",
        padding: isMobile ? "5px" : "10px",
        boxSizing: "border-box",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background: DASHBOARD_THEME.headerBg,
          color: "#fff",
          padding: "15px 25px",
          borderRadius: "12px",
          marginBottom: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: "40px", alignItems: "center" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "4px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              gap: "4px"
            }}
          >
            {["today", "lastSession"].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "6px 15px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "9px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.3s",
                  background: viewMode === mode ? "#6366f1" : "transparent",
                  color: viewMode === mode ? "#fff" : "#94a3b8",
                  boxShadow: viewMode === mode ? "0 4px 12px rgba(99, 102, 241, 0.4)" : "none"
                }}
              >
                {mode === "today" ? "Today" : "Last Session"}
              </button>
            ))}
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "8px 15px",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span
              style={{
                fontSize: "8px",
                color: "#94a3b8",
                fontWeight: "900",
                textTransform: "uppercase",
                display: "block",
              }}
            >
              Active Selection
            </span>
            <select
              value={activeLineLabel}
              onChange={(e) => setActiveLineLabel(e.target.value)}
              style={{
                background: "transparent",
                color: "#fff",
                border: "none",
                fontWeight: "900",
                fontSize: "12px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {!activeLineLabel ? (
                <option value="">{viewMode === "today" ? "NO ACTIVE CHANGEOVER" : "NO PREVIOUS SESSION"}</option>
              ) : (
                <option value={activeLineLabel}>
                  {(() => {
                    const l = activeLines.find(x => x.id === activeLineLabel || (x.line || x.summaryData?.line) === activeLineLabel);
                    const ln = (l?.line || l?.summaryData?.line || activeLineLabel || "---").toUpperCase();
                    const styleName = l?.toStyle || l?.summaryData?.toStyle || l?.style || l?.summaryData?.style || l?.uploadStyle || meta.style || "---";
                    const conName = l?.conNumber || l?.summaryData?.conNumber || l?.conNo || l?.summaryData?.conNo || l?.con || meta.con || "---";
                    const date = l?.lastUpdated?.split(' ')[0] || "";
                    const showDate = viewMode === "lastSession" && date;
                    return `${ln} | ${conName || styleName} ${showDate ? `(${date})` : ""}`;
                  })()}
                </option>
              )}
              {activeLines
                .filter(
                  (l) => l.id !== activeLineLabel && (l.line || l.summaryData?.line) !== activeLineLabel,
                )
                .map((l) => {
                  const ln = (l.line || l.summaryData?.line || "").toUpperCase();
                  const con = l.conNumber || l.summaryData?.conNumber || l.conNo || "---";
                  const date = l.lastUpdated?.split(' ')[0] || "";
                  const showDate = viewMode === "lastSession" && date;
                  return (
                    <option key={l.id} value={l.id}>
                      {ln} | {con} {showDate ? `(${date})` : ""}
                    </option>
                  );
                })}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              background: "#000",
              padding: "8px 20px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{ fontSize: "8px", color: "#94a3b8", fontWeight: "900" }}
              >
                FROM STYLE
              </div>
              <div style={{ fontSize: "13px", fontWeight: "900" }}>
                {meta.fromStyle}
              </div>
            </div>
            <ChevronRight size={16} color="#6366f1" />
            <div style={{ textAlign: "center" }}>
              <div
                style={{ fontSize: "8px", color: "#94a3b8", fontWeight: "900" }}
              >
                TO STYLE
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "900",
                  color: "#22c55e",
                }}
              >
                {meta.style}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">

            <button
              onClick={() => (window.location.href = "/dbr/floor-plan")}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-2xl border border-white/10 transition-all text-[11px] font-black uppercase tracking-widest"
            >
              <ArrowLeft size={16} /> Exit
            </button>
          </div>
      </div>

      <div
        style={{ flex: 1, display: "flex", overflow: "hidden", gap: "10px" }}
      >
        {/* COMBINED LEFT SIDEBAR */}
        <div
          style={{
            width: "260px",
            background: "rgba(10, 15, 25, 0.98)",
            padding: "20px",
            borderRadius: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            border: "1px solid rgba(255,255,255,0.05)",
            overflowY: "hidden",
          }}
        >
          {/* 1. SECTIONS STATUS */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Zap color="#f59e0b" size={16} fill="#f59e0b" />
              <span
                style={{
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Section Status
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
                maxHeight: "220px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
              className="custom-scrollbar"
            >
              <button
                onClick={() => setActiveSection("All")}
                style={{
                  gridColumn: "span 2",
                  background:
                    activeSection === "All"
                      ? "#6366f1"
                      : "rgba(255,255,255,0.03)",
                  color: "#fff",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "none",
                  fontSize: "9px",
                  fontWeight: "bold",
                  display: "flex",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <span>FULL LINE</span>
                <span>
                  {totalReadyGlobal}/{globalTotalMachines}
                </span>
              </button>
               {sections
                .filter((s) => !s.toLowerCase().includes("supermarket") && !s.toLowerCase().includes("inspection"))
                .map((name) => {
                  const sectionOps = masterData.filter(
                    (m) => {
                       const ms = (m.section || "").toLowerCase();
                       const tn = name.toLowerCase();
                       const isMatch = ms === tn || 
                                     (tn === 'assembly' && ms.includes('assembly')) || 
                                     (ms.includes(tn) || tn.includes(ms));
                       
                       const type = (m.operation?.machine_type || m.operation?.machine || "").toLowerCase();
                       const isActual = !type.includes("inspection") && 
                                        !type.includes("supermarket") && 
                                        !type.includes("helper");

                       return isMatch && isActual;
                    }
                  );
                  const ready = sectionOps.filter(
                    (m) =>
                      m.operation?.qcStatus === "QC_APPROVED" ||
                      m.operation?.machineArranged === "Yes",
                  ).length;
                  const total = sectionOps.length;
                  const isPunched = total > 0 && ready === total;
                  const isPartiallyPunched = total > 0 && ready > 0 && ready < total;
                  return (
                    <button
                      key={name}
                      onClick={() => setActiveSection(name)}
                      style={{
                        background:
                          activeSection === name
                            ? "#6366f1"
                            : "rgba(255,255,255,0.02)",
                        color: "#fff",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.03)",
                        fontSize: "9px",
                        fontWeight: "bold",
                        display: "flex",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          maxWidth: "60px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {name.toUpperCase()}
                      </span>
                      <span style={{ opacity: 0.6 }}>
                        {`${ready}/${total}`}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div
            style={{ height: "1px", background: "rgba(255,255,255,0.05)" }}
          />

          {/* 2. EXTERNAL OPERATIONS */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <ClipboardList color="#818cf8" size={16} />
              <span
                style={{
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                External Operations
              </span>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingRight: "4px",
              }}
            >
              <style>{`
                .war-room-select .rs-select__control {
                   background: rgba(0,0,0,0.3) !important;
                   border: 1px solid rgba(255,255,255,0.1) !important;
                   min-height: 24px !important;
                   height: 24px !important;
                   font-size: 9px !important;
                }
                .war-room-select .rs-select__single-value { color: #fff !important; }
                .war-room-select .rs-select__indicator { padding: 0 4px !important; }
              `}</style>
              {(() => {
                const allOps = [...externalOps, ...internalOps];
                const hasComparison = fromOps && fromOps.length > 0;
                
                if (allOps.length === 0) {
                  return (
                    <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "10px", fontWeight: "bold" }}>
                      No operations found in OB.
                    </div>
                  );
                }

                // Group by section
                const groups = {};
                allOps.forEach(op => {
                  const s = op.section || "General";
                  if (!groups[s]) groups[s] = [];
                  groups[s].push(op);
                });

                // Custom sort order: Collar first, Assembly last
                const FLOW_ORDER = ["collar", "cuff", "front", "back", "sleeve", "assembly"];
                const sectionNames = Object.keys(groups).sort((a, b) => {
                  const idxA = FLOW_ORDER.indexOf(a.toLowerCase());
                  const idxB = FLOW_ORDER.indexOf(b.toLowerCase());
                  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                  if (idxA !== -1) return -1;
                  if (idxB !== -1) return 1;
                  return a.localeCompare(b);
                });

                return sectionNames.map((sectionName) => {
                  const ops = groups[sectionName];
                  if (!ops || ops.length === 0) return null;
                  
                  const isActive = activeSection === sectionName;

                  return (
                    <div key={sectionName} style={{ 
                        marginBottom: "20px",
                        opacity: (activeSection && activeSection !== "All" && !isActive) ? 0.4 : 1,
                        transition: "opacity 0.3s ease"
                    }}>
                      <div style={{ 
                          padding: "10px 0 5px 0", 
                          borderBottom: isActive ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.05)", 
                          marginBottom: "10px", 
                          display: "flex", 
                          justifyContent: "space-between", 
                          alignItems: "center" 
                      }}>
                        <span style={{ 
                            fontSize: "10px", 
                            color: isActive ? "#818cf8" : "#94a3b8", 
                            fontWeight: "900", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.1em" 
                        }}>
                           {sectionName}
                        </span>
                        <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "bold" }}>{ops.length} ops</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {ops
                          .sort((a, b) => {
                            const isAExt = hasComparison && externalOps.some(e => e.uniqueKey === a.uniqueKey);
                            const isBExt = hasComparison && externalOps.some(e => e.uniqueKey === b.uniqueKey);
                            if (isAExt && !isBExt) return -1;
                            if (!isAExt && isBExt) return 1;
                            return 0;
                          })
                          .map((op, idx) => {
                            const isExternal = hasComparison && externalOps.some(e => e.uniqueKey === op.uniqueKey);
                            return (
                              <div key={op.uniqueKey || idx} style={{ position: "relative" }}>
                                  {isExternal && (
                                      <div style={{
                                          position: "absolute",
                                          top: "-5px",
                                          right: "10px",
                                          background: "#6366f1",
                                          color: "#fff",
                                          fontSize: "7px",
                                          fontWeight: "900",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                          zIndex: 2,
                                          boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
                                      }}>
                                          EXTERNAL
                                      </div>
                                  )}
                                  {renderOperationCard(op, idx, isExternal)}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>


        </div>

        {/* 3D VIEWPORT */}
        <div
          style={{
            flex: 1,
            background: "#080a0f",
            borderRadius: "24px",
            position: "relative",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              zIndex: 10,
            }}
          >
            <div
              style={{
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: "900",
                border: "1px solid rgba(255,255,255,0.15)",
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total SMV</span>
              <span style={{ color: "#f8fafc" }}>{obMetrics.totalSMV}</span>
            </div>
          </div>

          <Canvas
            camera={{ position: [0, 20, 50], fov: 45 }}
            shadows
            gl={{ antialias: true, logarithmicDepthBuffer: true }}
          >
            <fog attach="fog" args={["#080a0f", 50, 500]} />
            <ambientLight intensity={1.5} />
            <directionalLight
              position={[20, 60, 20]}
              intensity={2.5}
              castShadow
              shadow-bias={-0.005}
              shadow-mapSize={[2048, 2048]}
            />
            <Suspense fallback={null}>
              <Ground />
              <SectionFloors
                generatedSections={sections3D}
                activeSection={activeSection}
              />
              {/* Always render ALL machines from masterData so every section is visible */}
              {masterData.map((m) => (
                <group
                  key={m.id}
                  position={[m.position.x, m.position.y, m.position.z]}
                >
                  <GLBMachine
                    id={m.id}
                    path={getModelUrl(m.operation?.machine_type)}
                    mType={m.operation?.machine_type}
                    statusColor={
                      m.operation?.qcStatus === "QC_APPROVED" ||
                      m.operation?.machineArranged === "Yes"
                        ? STATUS.approved          // green — ready for new style
                        : m.operation?.qcStatus === "RUNNING" ||
                          m.operation?.machineArranged === "In Progress"
                          ? STATUS.changeover       // amber — changeover happening
                          : STATUS.producing        // red — still on old style
                    }
                    isPulsing={m.operation?.qcStatus === "RUNNING"}
                    opLabel={m.operation?.op_name || extractOpName(m.operation)}
                    smv={m.smv || m.operation?.smv || extractOpSMV(m.operation)}
                    secColor={
                      SEC_HEX[(m.section || "").toLowerCase().split(" ")[0]] ||
                      SEC_HEX.general
                    }
                    rotation={[m.rotation.x, m.rotation.y, m.rotation.z]}
                    oldStyle={meta.fromStyle}
                    newStyle={meta.style}
                    isInspectionItem={m.isInspection}
                    showStatusLights={m.section !== 'Assembly 4' && !(m.operation?.machine_type || '').toLowerCase().includes('supermarket')}
                    allocatedLine={m.operation?.allocatedLine}
                    section={m.section || m.operation?.section}
                  />
                </group>
              ))}
            </Suspense>
            <OrbitControls
              target={sceneCenter}
              maxPolarAngle={Math.PI / 2.1}
              enableDamping
              dampingFactor={0.1}
              rotateSpeed={4.0}
              makeDefault
            />
          </Canvas>
        </div>

        {/* ─── RIGHT SIDEBAR: IDLE MACHINES ─────────────────────────── */}
        <div
          style={{
            width: "200px",
            background: "rgba(10,15,25,0.98)",
            borderRadius: "24px",
            border: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "18px 18px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 6px #10b981",
                  animation: "pulse 2s infinite",
                }}
              />
              <span
                style={{
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                }}
              >
                Idle Machines
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  background: "#10b981",
                  color: "#fff",
                  fontSize: "9px",
                  fontWeight: "900",
                  padding: "2px 8px",
                  borderRadius: "20px",
                }}
              >
                {totalIdle}
              </span>
            </div>

            {/* Floor Toggle */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
              {["Floor 1", "Floor 2"].map((f) => (
                <button
                  key={f}
                  onClick={() => setIdleFloor(f)}
                  style={{
                    flex: 1,
                    padding: "6px",
                    borderRadius: "8px",
                    border: "none",
                    background:
                      idleFloor === f ? "#6366f1" : "rgba(255,255,255,0.05)",
                    color: "#fff",
                    fontSize: "9px",
                    fontWeight: "900",
                    cursor: "pointer",
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ position: "relative" }}>
              <input
                value={idleMachineFilter}
                onChange={(e) => setIdleMachineFilter(e.target.value)}
                placeholder="Search machine / serial..."
                style={{
                  width: "100%",
                  padding: "7px 10px 7px 28px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "9px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <Search
                size={11}
                style={{
                  position: "absolute",
                  left: "9px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b",
                }}
              />
            </div>
          </div>

          {/* Grouped Lines */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {floorLines.map((ln) => {
              const aggregated = groupedIdle[ln] || {};
              const machinesInLineCount = Object.values(aggregated).reduce(
                (sum, list) => sum + list.length,
                0,
              );
              if (machinesInLineCount === 0 && filterLow) return null;

              return (
                <div key={ln}>
                  {/* Line header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: "900",
                          color: "#818cf8",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {ln}
                      </span>
                      {externalOps.some(op => normalizeLineName(op.allocatedLine) === normalizeLineName(ln)) && (
                        <CheckCircle2 size={10} color="#10b981" />
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: "8px",
                        background:
                          machinesInLineCount > 0
                            ? "rgba(16,185,129,0.15)"
                            : "rgba(100,116,139,0.15)",
                        color:
                          machinesInLineCount > 0 ? "#10b981" : "#64748b",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        fontWeight: "900",
                      }}
                    >
                      {machinesInLineCount} idle
                    </span>
                  </div>
                  {machinesInLineCount === 0 ? (
                    <div
                      style={{
                        fontSize: "9px",
                        color: "#334155",
                        fontStyle: "italic",
                        paddingLeft: "6px",
                        paddingBottom: "4px",
                      }}
                    >
                      No idle machines
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                      }}
                    >
                      {Object.entries(aggregated).map(([mName, list], i) => {
                        const count = list.length;
                        const serials = list
                          .map((m) => m.mc_serial_no || m.machine_id || "—")
                          .join(", ");
                        return (
                          <div
                            key={i}
                            style={{
                              padding: "8px 10px",
                              background: "rgba(16,185,129,0.06)",
                              borderRadius: "10px",
                              border: "1px solid rgba(16,185,129,0.15)",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                background: "#10b981",
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  color: "#f1f5f9",
                                  fontSize: "9px",
                                  fontWeight: "900",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{mName.toUpperCase()} {count > 1 ? `(${count})` : ""}</span>
                                  {externalOps.some(op =>
                                    normalizeLineName(op.allocatedLine) === normalizeLineName(ln) &&
                                    canonicalMachineType(op.machine || "") === canonicalMachineType(mName)
                                  ) && (
                                      <CheckCircle2 size={9} color="#10b981" />
                                    )}
                                </div>
                              </div>
                              <div
                                style={{
                                  color: "#64748b",
                                  fontSize: "8px",
                                  fontWeight: "700",
                                  marginTop: "1px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {serials}
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: "8px",
                                color: "#10b981",
                                fontWeight: "900",
                                flexShrink: 0,
                              }}
                            >
                              IDLE
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side panel for operation details - removed as component is missing */}



    </div>
    </>
  );
}
