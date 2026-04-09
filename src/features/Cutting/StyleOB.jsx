// src/features/Cutting/StyleOB.jsx
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { storage, db } from "../../firebase";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from "firebase/storage";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
} from "firebase/firestore";
import { FaFileUpload, FaCloudDownloadAlt, FaFileExcel, FaExchangeAlt } from "react-icons/fa";
import md5 from "crypto-js/md5";
import dayjs from "dayjs";
import Select from "react-select";

// Compute MD5 hash for a row
function getRowHashFromVals(vals) {
  return md5(vals.join("||")).toString();
}


// Helper: fetchSheetData from Book 1.xlsx
async function fetchSheetData(sheetName, accessToken) {
  const userPrincipalName = "ratneshkumar@yorkermedia.com";
  const filePath = "Book 1.xlsx";
  const encodedFilePath = encodeURIComponent(filePath);
  const usedRangeUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipalName}/drive/root:/${encodedFilePath}:/workbook/worksheets('${sheetName}')/usedRange?$select=values`;
  const res = await axios.get(usedRangeUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.data.values || [];
}

// Helper: getAccessToken
async function getAccessToken() {
  try {
    const res = await axios.get(
      "https://us-central1-lagunaclothing-ishika.cloudfunctions.net/getAccessToken"
    );
    return res.data.access_token;
  } catch (err) {
    console.error("Failed to fetch access token for StyleOB.", err);
    return null;
  }
}

// Process rows with deduplication
function processRows(sheetDataArray) {
  if (!sheetDataArray || sheetDataArray.length < 4) return [];
  const dataRows = sheetDataArray.slice(3);

  const selectedCols = [0, 4, 1, 2, 3, 9];

  const processed = [];
  const seenHashes = new Set();

  for (const row of dataRows) {
    if (row.slice(0, 5).every((c) => c == null || String(c).trim() === "")) {
      continue;
    }

    const vals = selectedCols.map((i) =>
      row[i] != null ? String(row[i]).trim() : ""
    );
    const rowHash = getRowHashFromVals(vals);

    if (seenHashes.has(rowHash)) continue;

    seenHashes.add(rowHash);
    processed.push({ vals, rowHash });
  }
  return processed;
}

export default function StyleOB() {
  const [worksheets, setWorksheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(() =>
    sessionStorage.getItem("styleOB_selectedSheet") || ""
  );
  const [sheetData, setSheetData] = useState([]);
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState(null);
  const [rowUploads, setRowUploads] = useState({});
  const [activeUploadHashes, setActiveUploadHashes] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(() =>
    Number(sessionStorage.getItem("styleOB_currentPage")) || 1
  );
  const itemsPerPage = 15;
  const listenersRef = useRef({});

  // Persist selectedSheet & currentPage
  useEffect(() => {
    if (selectedSheet) {
      sessionStorage.setItem("styleOB_selectedSheet", selectedSheet);
    }
  }, [selectedSheet]);

  useEffect(() => {
    sessionStorage.setItem("styleOB_currentPage", currentPage);
  }, [currentPage]);

  // Fetch Graph API token on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) setAccessToken(token);
        else setError("Failed to fetch access token for StyleOB.");
      } catch (err) {
        console.error(err);
        setError("Failed to fetch access token for StyleOB.");
      }
    })();
  }, []);

  // Fetch worksheets, sheet data, and uploads
  useEffect(() => {
    if (!accessToken) return;

    const fetchWorksheets = async () => {
      try {
        const userPrincipalName = "ratneshkumar@yorkermedia.com";
        const filePath = "Book 1.xlsx";
        const encodedFilePath = encodeURIComponent(filePath);
        const listUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipalName}/drive/root:/${encodedFilePath}:/workbook/worksheets`;
        const listRes = await axios.get(listUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const sheets = listRes.data.value
          .map((s) => s.name)
          .filter((n) => n.toLowerCase() !== "summary");
        setWorksheets(sheets);
        setSelectedSheet((prev) =>
          prev && sheets.includes(prev) ? prev : sheets[0] || ""
        );
      } catch (err) {
        console.error(err);
        setError("Failed to fetch worksheets list for StyleOB.");
      }
    };

    const fetchAndSetSheetData = async (sheetName) => {
      try {
        const data = await fetchSheetData(sheetName, accessToken);
        setSheetData(data);
        const processed = processRows(data);
        const totalRows = processed.length;
        const totalPagesCalc = Math.ceil(totalRows / itemsPerPage);
        if (totalPagesCalc > 0 && currentPage > totalPagesCalc) {
          setCurrentPage(1);
        }
      } catch (err) {
        console.error(err);
        setError(`Failed to load data for sheet "${sheetName}"`);
      }
    };

    const loadStyleMetadata = (sheetName) => {
      // Clear existing listeners
      Object.values(listenersRef.current).forEach((unsub) => unsub && unsub());
      listenersRef.current = {};

      const q = query(collection(db, "styleOBmetadata"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const metadataUpdates = {};
        snapshot.docs.forEach((doc) => {
          metadataUpdates[doc.id] = doc.data();
        });
        setRowUploads(prev => ({ ...prev, ...metadataUpdates }));
      });
      listenersRef.current['collection'] = unsubscribe;
    };

    const fetchStorageFiles = async (sheetName) => {
      try {
        const listRef = storageRef(storage, `styleOBUploads/${sheetName}`);
        const fileList = await listAll(listRef);
        const hashes = new Set();
        const uploadsMap = {};
        
        fileList.items.forEach(item => {
          const dotIndex = item.name.lastIndexOf(".");
          const rowHash = dotIndex > 0 ? item.name.substring(0, dotIndex) : item.name;
          hashes.add(rowHash);
          uploadsMap[rowHash] = { hashedName: item.name };
        });

        setActiveUploadHashes(hashes);
        setRowUploads(prev => ({ ...prev, ...uploadsMap }));
      } catch (err) {
        console.error("Storage list error:", err);
      }
    };

    (async () => {
      try {
        await fetchWorksheets();
        if (selectedSheet) {
          await fetchAndSetSheetData(selectedSheet);
          fetchStorageFiles(selectedSheet);
          loadStyleMetadata(selectedSheet);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [accessToken, selectedSheet]);

  const handleSheetSwitch = (sheetName) => {
    setSelectedSheet(sheetName);
    setCurrentPage(1);
  };

  const handleFileSelect = (vals, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rowHash = getRowHashFromVals(vals);
    setRowUploads((prev) => ({
      ...prev,
      [rowHash]: {
        ...prev[rowHash],
        selectedFile: file,
      },
    }));
  };

  const handleUpload = async (vals) => {
    const rowHash = getRowHashFromVals(vals);
    const rowInfo = rowUploads[rowHash] || {};
    const file = rowInfo.selectedFile;
    if (!file) {
      setError("No file selected for upload.");
      return;
    }
    try {
      const subfolder = selectedSheet;
      const originalName = file.name;
      const dotIndex = originalName.lastIndexOf(".");
      const extension = dotIndex >= 0 ? originalName.substring(dotIndex) : "";

      const hashedFileName = rowHash + extension;
      const path = `styleOBUploads/${subfolder}/${hashedFileName}`;
      const storageReference = storageRef(storage, path);

      const metadataFields = {
        buyer: vals[0]?.toString().trim() || "",
        style: vals[1]?.toString().trim() || "",
        conNo: vals[2]?.toString().trim() || "",
        color: vals[3]?.toString().trim() || "",
        orderQty: vals[4]?.toString().trim() || "",
        weekPlan: vals[5]?.toString().trim() || "",
        uploadedAt: dayjs().toISOString(),
        uploadLine: selectedSheet,
        originalFileName: originalName,
      };

      await uploadBytes(storageReference, file, {
        customMetadata: metadataFields,
      });

      const fileUrl = await getDownloadURL(storageReference);

      const initialMetadata = {
        rowHash,
        ...metadataFields,
        hashedFileName,
        fileUrl,
      };

      await setDoc(doc(db, "styleOBmetadata", rowHash), initialMetadata, { merge: true });

      // Safer style document ID (replace spaces with _, uppercase)
      const styleId = metadataFields.style
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_]/g, "")
        .toUpperCase();

      await setDoc(
        doc(db, "styles", styleId),
        {
          styleCode: metadataFields.style,
          buyer: metadataFields.buyer,
          conNo: metadataFields.conNo,
          color: metadataFields.color,
          orderQty: metadataFields.orderQty,
          weekPlan: metadataFields.weekPlan,
          obUploaded: true,
          obFileUrl: fileUrl,
          status: "OB_UPLOADED",
          lastUpdated: dayjs().toISOString(),
        },
        { merge: true }
      );

      setRowUploads((prev) => ({
        ...prev,
        [rowHash]: {
          ...prev[rowHash],
          ...initialMetadata,
          selectedFile: null,
        },
      }));
      setError(null);

      if (!listenersRef.current['collection']) {
        loadStyleMetadata(selectedSheet);
      }
    } catch (err) {
      console.error("Error uploading OB file:", err);
      setError("Failed to upload OB file.");
    }
  };

  const [modalReplaceHashKey, setModalReplaceHashKey] = useState(null);

  const handleReplaceOBClick = (vals) => {
    const rowHash = getRowHashFromVals(vals);
    setModalReplaceHashKey(rowHash);
  };

  const confirmReplaceOB = async () => {
    if (!modalReplaceHashKey) return;
    const rowHash = modalReplaceHashKey;
    const rowInfo = rowUploads[rowHash] || {};
    const hashedName = rowInfo.hashedName;
    const uploadLine = rowInfo.uploadLine || selectedSheet;
    const styleCode = rowInfo.style || ""; // We stored style in metadata

    if (!hashedName) {
      setError("No existing file to replace.");
      setModalReplaceHashKey(null);
      return;
    }

    try {
      const path = `styleOBUploads/${uploadLine}/${hashedName}`;
      await deleteObject(storageRef(storage, path));
      await deleteDoc(doc(db, "styleOBmetadata", rowHash));

      // IMPORTANT FIX: Update styles collection when OB is replaced/deleted
      if (styleCode) {
        // Safer style ID (same as in upload)
        const styleId = styleCode
          .trim()
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_]/g, "")
          .toUpperCase();

        await setDoc(
          doc(db, "styles", styleId),
          {
            obUploaded: false,
            obFileUrl: "",
            status: "OB_PENDING",
            lastUpdated: dayjs().toISOString(),
          },
          { merge: true }
        );
      }

      setRowUploads((prev) => ({
        ...prev,
        [rowHash]: { selectedFile: null },
      }));
      setModalReplaceHashKey(null);
      setError(null);
    } catch (err) {
      console.error("Error replacing OB:", err);
      setError(`Failed to replace OB: ${err.message}`);
      setModalReplaceHashKey(null);
    }
  };

  const cancelReplaceOB = () => {
    setModalReplaceHashKey(null);
    setError(null);
  };

  const headerMainRaw = sheetData[1] || [];
  const headerSubRaw = sheetData[2] || [];
  const headerMain = headerMainRaw.map((h) =>
    typeof h === "string" ? h.replace(/-Subodh$/i, "").trim() : h
  );
  const headerSub = headerSubRaw.map((h) =>
    typeof h === "string" ? h.replace(/-Subodh$/i, "").trim() : h
  );

  const selectedColsConst = [0, 4, 1, 2, 3, 9];
  const processedRows = processRows(sheetData);
  const totalRows = processedRows.length;
  const totalPages = Math.ceil(totalRows / itemsPerPage) || 1;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const currentData = processedRows.slice(startIdx, startIdx + itemsPerPage);

  // Lazy load URLs for current page
  useEffect(() => {
    if (!selectedSheet) return;
    currentData.forEach(async ({ rowHash }) => {
      if (activeUploadHashes.has(rowHash) && !rowUploads[rowHash]?.fileUrl) {
        try {
          const info = rowUploads[rowHash] || {};
          const ext = info.hashedName?.substring(info.hashedName.lastIndexOf(".")) || ".pdf";
          const path = `styleOBUploads/${selectedSheet}/${rowHash}${ext}`;
          const url = await getDownloadURL(storageRef(storage, path));
          setRowUploads(prev => ({
            ...prev,
            [rowHash]: { ...prev[rowHash], fileUrl: url }
          }));
        } catch (e) {
          // Fallback or ignore
        }
      }
    });
  }, [currentPage, selectedSheet, activeUploadHashes]);

  const handlePrevious = () => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  };
  const handleNext = () => {
    setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
  };

  // Mobile dropdown options
  const sheetOptions = [
    { value: "", label: "All Lines" },
    ...worksheets.map(sheet => ({ value: sheet, label: sheet })),
  ];

  const selectedOption = sheetOptions.find(opt => opt.value === selectedSheet) || sheetOptions[0];

  return (
    <div className="min-h-screen bg-white text-gray-800 p-4 sm:p-6">
      <h2 className="text-2xl font-semibold mb-4 text-left text-gray-700">
        Style OB
      </h2>

      {error && (
        <p className="text-red-500 bg-red-200 p-4 rounded-md text-center mb-6">
          {error}
        </p>
      )}

      {/* Sheet Selector */}
      <div className="mb-6">
        {/* Desktop: Horizontal buttons */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          {worksheets.map((sheetName) => (
            <button
              key={sheetName}
              onClick={() => handleSheetSwitch(sheetName)}
              className={`px-4 py-2 rounded-md font-semibold transition-all ${selectedSheet === sheetName
                  ? "border-2 border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:bg-violet-50 hover:text-indigo-600"
                }`}
              style={{ backgroundColor: selectedSheet === sheetName ? "rgba(99, 102, 241, 0.1)" : "transparent" }}
            >
              <FaFileExcel className="inline mr-2" />
              {sheetName}
            </button>
          ))}
        </div>

        {/* Mobile: Dropdown */}
        <div className="md:hidden">
          <Select
            value={selectedOption}
            onChange={(option) => handleSheetSwitch(option.value)}
            options={sheetOptions}
            className="w-full"
            styles={{
              control: (base) => ({
                ...base,
                backgroundColor: "#f8f8f8",
                borderColor: "#ccc",
                borderRadius: "6px",
                minHeight: "42px",
                boxShadow: "none",
                "&:hover": { borderColor: "#aaa" },
              }),
              singleValue: (base) => ({ ...base, color: "#333", fontWeight: "500" }),
              menu: (base) => ({ ...base, zIndex: 9999 }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected ? "#DBD4D4" : state.isFocused ? "#eee" : "white",
                color: "#333",
                cursor: "pointer",
              }),
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-md">
        <div className="min-w-[900px] md:min-w-[1100px] lg:min-w-full">
          <table className="min-w-max whitespace-nowrap text-sm border-collapse">
            <thead style={{ backgroundColor: "#6366f1", color: "#fff" }}>
              <tr>
                {selectedColsConst.map((ci) => (
                  <th
                    key={ci}
                    rowSpan={headerSub[ci] ? 1 : 2}
                    className="px-4 sm:px-6 py-3 border text-center uppercase text-xs font-bold"
                    style={{ 
                      position: ci === 1 ? "sticky" : "static",
                      left: ci === 1 ? 0 : "auto",
                      zIndex: ci === 1 ? 20 : 1,
                      backgroundColor: ci === 1 ? "#6366f1" : "transparent"
                    }}
                  >
                    {headerMain[ci] || ""}
                  </th>
                ))}
                <th rowSpan={2} className="px-4 sm:px-6 py-3 border text-center uppercase text-xs font-bold">
                  Changeover
                </th>
                <th rowSpan={2} className="px-4 sm:px-6 py-3 border text-center uppercase text-xs font-bold">
                  Upload OB
                </th>
              </tr>
              <tr>
                {selectedColsConst.map((ci) =>
                  headerSub[ci] && (
                    <th
                      key={ci}
                      className="px-4 sm:px-6 py-3 border text-center uppercase text-xs font-bold"
                      style={{ 
                        position: ci === 1 ? "sticky" : "static",
                        left: ci === 1 ? 0 : "auto",
                        zIndex: ci === 1 ? 20 : 1,
                        backgroundColor: ci === 1 ? "#6366f1" : "transparent"
                      }}
                    >
                      {headerSub[ci]}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {currentData.map(({ vals, rowHash }, idx) => {
                const info = rowUploads[rowHash] || {};
                const fileUrl = info.fileUrl || null;

                const globalIndex = startIdx + idx;
                let isChangeover = false;
                if (globalIndex > 0) {
                  const currentStyle = vals[1];
                  const previousStyle = processedRows[globalIndex - 1]?.vals[1];
                  if (currentStyle !== previousStyle) isChangeover = true;
                }

                return (
                  <tr
                    key={rowHash + "_" + idx}
                    className="border-b border-gray-200 hover:bg-gray-50"
                  >
                    {vals.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`px-4 sm:px-6 py-2 text-center ${ci === 2 ? "sticky left-0 bg-white z-10" : ""
                          }`}
                      >
                        {cell}
                      </td>
                    ))}

                    <td className="px-4 sm:px-6 py-2 text-center font-bold">
                      {isChangeover ? (
                        <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs flex items-center justify-center gap-1">
                          <FaExchangeAlt /> Changeover
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>

                    <td className="px-4 sm:px-6 py-2 text-center">
                      {fileUrl ? (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-3 py-1 rounded text-white"
                            style={{ backgroundColor: "#6366f1", color: "#fff" }}
                          >
                            <FaCloudDownloadAlt className="inline mr-1" />
                            Download OB
                          </a>
                          <button
                            onClick={() => handleReplaceOBClick(vals)}
                            className="px-3 py-1 rounded text-gray-800"
                            style={{ backgroundColor: "#6366f1", color: "#fff" }}
                          >
                            <FaFileUpload className="inline mr-1" />
                            Replace OB
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                          <input
                            type="file"
                            accept=".xlsx,.xls,.pdf,.docx"
                            onChange={(e) => handleFileSelect(vals, e)}
                            className="text-sm w-full max-w-[180px]"
                          />
                          <button
                            onClick={() => handleUpload(vals)}
                            className="px-3 py-1 rounded text-gray-800 whitespace-nowrap"
                            style={{ backgroundColor: "#6366f1", color: "#fff" }}
                          >
                            <FaFileUpload className="inline mr-1" />
                            Upload OB
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {currentData.length === 0 && (
                <tr>
                  <td
                    colSpan={selectedColsConst.length + 2}
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No rows to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end items-center mt-4 gap-2 flex-wrap">
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>

      {modalReplaceHashKey && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 p-4">
          <div className="bg-white rounded-lg p-6 space-y-4 max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold">Replace OB Confirmation</h3>
            <p>Are you sure you want to replace the existing OB file?</p>
            <div className="flex justify-end space-x-4 flex-wrap gap-3">
              <button
                onClick={confirmReplaceOB}
                className="bg-green-500 text-white px-5 py-2 rounded hover:bg-green-600"
              >
                Yes
              </button>
              <button
                onClick={cancelReplaceOB}
                className="bg-gray-300 text-gray-800 px-5 py-3 rounded hover:bg-gray-400"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
