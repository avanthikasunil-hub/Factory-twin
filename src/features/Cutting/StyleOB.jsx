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
} from "firebase/firestore";
import { FaFileUpload, FaCloudDownloadAlt, FaFileExcel, FaExchangeAlt } from "react-icons/fa";
import md5 from "crypto-js/md5";
import dayjs from "dayjs";

// Compute MD5 hash for a row using the same columns/order
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

// --- UPDATED COLUMN MAPPING WITH DEDUPLICATION ---
// Visual Order: Buyer, Style, Con No, Color, Order Qty, Week Plan
// Excel Indices: 0=Buyer, 4=Style, 1=ConNo, 2=Color, 3=Qty, 9=WeekPlan
function processRows(sheetDataArray) {
    if (!sheetDataArray || sheetDataArray.length < 4) return [];
    const dataRows = sheetDataArray.slice(3);

    const selectedCols = [0, 4, 1, 2, 3, 9];

    const processed = [];
    const seenHashes = new Set(); // Track hashes to prevent duplicates

    for (const row of dataRows) {
        // 1. Skip empty rows
        if (row.slice(0, 5).every((c) => c == null || String(c).trim() === "")) {
            continue;
        }

        // build vals for hashing and display
        const vals = selectedCols.map((i) =>
            row[i] != null ? String(row[i]).trim() : ""
        );
        const rowHash = getRowHashFromVals(vals);

        // 2. CHECK FOR DUPLICATES
        // If we have already processed this exact row (same hash), skip it
        if (seenHashes.has(rowHash)) {
            continue;
        }

        // Mark this hash as seen
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
                if (token) {
                    setAccessToken(token);
                } else {
                    setError("Failed to fetch access token for StyleOB.");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to fetch access token for StyleOB.");
            }
        })();
    }, []);

    // When token or selectedSheet changes: fetch worksheets, sheetData, and uploads
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

        const loadUploadedFiles = async (sheetName) => {
            // Clear old listeners
            Object.values(listenersRef.current).forEach((unsub) => unsub && unsub());
            listenersRef.current = {};

            try {
                const subfolder = sheetName;
                const listRef = storageRef(storage, `styleOBUploads/${subfolder}`);
                const fileList = await listAll(listRef);
                const uploadsMap = {};

                for (const itemRef of fileList.items) {
                    try {
                        const fileUrl = await getDownloadURL(itemRef);
                        const hashedFileName = itemRef.name;
                        const dotIndex = hashedFileName.lastIndexOf(".");
                        const rowHash =
                            dotIndex > 0
                                ? hashedFileName.substring(0, dotIndex)
                                : hashedFileName;

                        uploadsMap[rowHash] = {
                            fileUrl,
                            hashedName: hashedFileName,
                        };

                        // Listen to metadata changes in Firestore
                        const metadataRef = doc(db, "styleOBmetadata", rowHash);
                        const unsub = onSnapshot(
                            metadataRef,
                            (docSnap) => {
                                if (docSnap.exists()) {
                                    const metadata = docSnap.data();
                                    setRowUploads((prev) => ({
                                        ...prev,
                                        [rowHash]: {
                                            ...prev[rowHash],
                                            ...uploadsMap[rowHash],
                                            ...metadata,
                                        },
                                    }));
                                }
                            },
                            (err) => {
                                console.error("Snapshot error for styleOBmetadata:", err);
                            }
                        );
                        listenersRef.current[rowHash] = unsub;
                    } catch (err) {
                        console.error("Error loading uploaded file URL:", err);
                    }
                }
                setRowUploads((prev) => ({
                    ...uploadsMap,
                    ...prev,
                }));
            } catch (err) {
                console.error("Error loading styleOB files from storage:", err);
                setError("Error loading previously uploaded OB files.");
            }
        };

        (async () => {
            try {
                await fetchWorksheets();
                if (selectedSheet) {
                    await fetchAndSetSheetData(selectedSheet);
                    await loadUploadedFiles(selectedSheet);
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

    // --- UPDATED UPLOAD FUNCTION ---
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

            // Construct hashed filename
            const hashedFileName = rowHash + extension;
            const path = `styleOBUploads/${subfolder}/${hashedFileName}`;
            const storageReference = storageRef(storage, path);

            // --- FIXED METADATA MAPPING ---
            // vals order: [0:Buyer, 1:Style, 2:ConNo, 3:Color, 4:Qty, 5:WeekPlan]
            const metadataFields = {
                buyer: vals[0]?.toString().trim() || "",
                style: vals[1]?.toString().trim() || "",    // FIXED: Added Style
                conNo: vals[2]?.toString().trim() || "",
                color: vals[3]?.toString().trim() || "",
                orderQty: vals[4]?.toString().trim() || "",
                weekPlan: vals[5]?.toString().trim() || "", // FIXED: Added WeekPlan
                uploadedAt: dayjs().toISOString(),
                uploadLine: selectedSheet,
                originalFileName: originalName,
            };

            // 1. Upload File
            await uploadBytes(storageReference, file, {
                customMetadata: metadataFields,
            });

            // 2. Get Download URL
            const fileUrl = await getDownloadURL(storageReference);

            // 3. Prepare full metadata object
            const initialMetadata = {
                rowHash,
                ...metadataFields,
                hashedFileName,
                fileUrl,
            };

            // 4. Save to Firestore
            await setDoc(doc(db, "styleOBmetadata", rowHash), initialMetadata, {
                merge: true,
            });

            // 5. Update Local State immediately
            setRowUploads((prev) => ({
                ...prev,
                [rowHash]: {
                    ...prev[rowHash],
                    ...initialMetadata,
                    selectedFile: null, // Clear the file input
                },
            }));
            setError(null);

            // 6. Ensure real-time listener is attached
            if (!listenersRef.current[rowHash]) {
                const metadataRef = doc(db, "styleOBmetadata", rowHash);
                const unsub = onSnapshot(
                    metadataRef,
                    (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            setRowUploads((prev) => ({
                                ...prev,
                                [rowHash]: {
                                    ...prev[rowHash],
                                    ...data,
                                },
                            }));
                        }
                    },
                    (err) => console.error("Snapshot error for styleOBmetadata:", err)
                );
                listenersRef.current[rowHash] = unsub;
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
        const hashedName = rowInfo.hashedFileName;
        const uploadLine = rowInfo.uploadLine || selectedSheet;
        if (!hashedName) {
            setError("No existing file to replace.");
            setModalReplaceHashKey(null);
            return;
        }
        try {
            const path = `styleOBUploads/${uploadLine}/${hashedName}`;
            await deleteObject(storageRef(storage, path));
            await deleteDoc(doc(db, "styleOBmetadata", rowHash));
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

    // Columns to display
    const selectedColsConst = [0, 4, 1, 2, 3, 9];

    const processedRowsList = processRows(sheetData);

    const totalRows = processedRowsList.length;
    const totalPages = Math.ceil(totalRows / itemsPerPage) || 1;
    const startIdx = (currentPage - 1) * itemsPerPage;
    const currentData = processedRowsList.slice(startIdx, startIdx + itemsPerPage);

    const handlePrevious = () => {
        setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
    };
    const handleNext = () => {
        setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
    };

    return (
        <div className="min-h-screen bg-white text-gray-800 p-4">
            <h2 className="text-2xl font-semibold mb-4 text-left text-gray-700">
                Style OB
            </h2>
            {error && (
                <p className="text-red-500 bg-red-200 p-4 rounded-md text-center">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                {worksheets.map((sheetName) => (
                    <button
                        key={sheetName}
                        onClick={() => handleSheetSwitch(sheetName)}
                        className={`px-4 py-2 rounded-md font-semibold text-gray-800 ${selectedSheet === sheetName ? "border-2 border-gray-400" : ""
                            }`}
                        style={{ backgroundColor: "#DBD4D4" }}
                    >
                        <FaFileExcel className="inline mr-2" />
                        {sheetName}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="min-w-max whitespace-nowrap text-sm">
                    <thead className="bg-[#ECE7E7]">
                        <tr>
                            {selectedColsConst.map((ci, colIdx) => (
                                <th
                                    key={ci}
                                    rowSpan={headerSub[ci] ? 1 : 2}
                                    className={`px-6 py-3 border text-center uppercase text-xs font-bold ${colIdx === 1 ? 'sticky left-0 bg-[#ECE7E7] z-10' : ''}`}
                                >
                                    {headerMain[ci] || ""}
                                </th>
                            ))}
                            <th
                                rowSpan={2}
                                className="px-6 py-3 border text-center uppercase text-xs font-bold"
                            >
                                Changeover
                            </th>
                            <th
                                rowSpan={2}
                                className="px-6 py-3 border text-center uppercase text-xs font-bold"
                            >
                                Upload OB
                            </th>
                        </tr>
                        <tr>
                            {selectedColsConst.map((ci, colIdx) =>
                                headerSub[ci] && (
                                    <th
                                        key={ci}
                                        className={`px-6 py-3 border text-center uppercase text-xs font-bold ${colIdx === 1 ? 'sticky left-0 bg-[#ECE7E7] z-10' : ''}`}
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

                            // --- Changeover Logic ---
                            // Compare current row style (index 1) with previous row style.
                            const globalIndex = startIdx + idx;
                            let isChangeover = false;

                            if (globalIndex > 0) {
                                const currentStyle = vals[1];
                                const previousStyle = processedRowsList[globalIndex - 1].vals[1];
                                if (currentStyle !== previousStyle) {
                                    isChangeover = true;
                                }
                            }

                            return (
                                <tr
                                    key={rowHash + "_" + idx}
                                    className="border-b border-gray-200 hover:bg-gray-50"
                                >
                                    {vals.map((cell, ci) => (
                                        <td key={ci} className={`px-6 py-2 text-center ${ci === 1 ? 'sticky left-0 bg-white z-10' : ''}`}>
                                            {cell}
                                        </td>
                                    ))}

                                    {/* Changeover Column */}
                                    <td className="px-6 py-2 text-center font-bold">
                                        {isChangeover ? (
                                            <span className="bg-red-100 text-red-600 px-2 py-1 rounded-full text-xs flex items-center justify-center gap-1">
                                                <FaExchangeAlt /> Changeover
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* Upload OB Column */}
                                    <td className="px-6 py-2 text-center">
                                        {fileUrl ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <a
                                                    href={fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-block px-3 py-1 rounded text-white"
                                                    style={{ backgroundColor: "#DBD4D4", color: "#333" }}
                                                >
                                                    <FaCloudDownloadAlt className="inline mr-1" />
                                                    Download OB
                                                </a>
                                                <button
                                                    onClick={() => handleReplaceOBClick(vals)}
                                                    className="px-3 py-1 rounded text-gray-800"
                                                    style={{ backgroundColor: "#DBD4D4" }}
                                                >
                                                    <FaFileUpload className="inline mr-1" />
                                                    Replace OB
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2">
                                                <input
                                                    type="file"
                                                    accept=".xlsx,.xls,.pdf,.docx"
                                                    onChange={(e) => handleFileSelect(vals, e)}
                                                />
                                                <button
                                                    onClick={() => handleUpload(vals)}
                                                    className="px-3 py-1 rounded text-gray-800"
                                                    style={{ backgroundColor: "#DBD4D4" }}
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

            <div className="flex justify-end items-center mt-4 gap-2">
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
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold">Replace OB Confirmation</h3>
                        <p>Are you sure you want to replace the existing OB file?</p>
                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={confirmReplaceOB}
                                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                            >
                                Yes
                            </button>
                            <button
                                onClick={cancelReplaceOB}
                                className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
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
