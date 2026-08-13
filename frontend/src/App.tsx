import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL = "http://127.0.0.1:8000";

type Patient = {
  name: string | null;
  age: number | null;
  gender: string | null;
};

type Medicine = {
  name: string;
  confidence: number;
  ocr_match: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  verified: boolean;
};

type PrescriptionResponse = {
  success: boolean;
  message: string;
  filename?: string;
  extracted_text?: string;
  patient?: Patient;
  medicine_candidates?: Medicine[];
  error?: string;
};

type HistoryItem = {
  id: number;
  filename: string;
  patient_name: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  medicines: Medicine[];
  created_at: string | null;
};

type NearbyStore = {
  id: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  distance: number;
};

function App() {
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);

  const [result, setResult] =
    useState<PrescriptionResponse | null>(null);

  const [error, setError] = useState("");

  // ==============================
  // HISTORY
  // ==============================

  const [history, setHistory] =
    useState<HistoryItem[]>([]);

  const [showHistory, setShowHistory] =
    useState(false);

  const [historyLoading, setHistoryLoading] =
    useState(false);

  // ==============================
  // NEARBY STORES
  // ==============================

  const [nearbyStores, setNearbyStores] =
    useState<NearbyStore[]>([]);

  const [selectedMedicine, setSelectedMedicine] =
    useState("");

  const [storesLoading, setStoresLoading] =
    useState(false);

  const [showStores, setShowStores] =
    useState(false);

  // ==============================
  // FILE SELECT
  // ==============================

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setError("");

    setShowStores(false);
    setNearbyStores([]);
  };

  // ==============================
  // LOAD HISTORY
  // ==============================

  const loadHistory = async () => {
    setHistoryLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/prescriptions`
      );

      if (!response.ok) {
        throw new Error(
          "Could not load prescription history."
        );
      }

      const data =
        await response.json();

      if (Array.isArray(data)) {
        setHistory(data);
      } else if (
        Array.isArray(data.prescriptions)
      ) {
        setHistory(data.prescriptions);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error(
        "History error:",
        err
      );

      setError(
        "Could not load prescription history. Make sure FastAPI is running on port 8000."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // ==============================
  // SHOW / HIDE HISTORY
  // ==============================

  const toggleHistory = async () => {
    const newValue =
      !showHistory;

    setShowHistory(newValue);

    if (newValue) {
      await loadHistory();
    }
  };

  // ==============================
  // VIEW HISTORY ITEM
  // ==============================

  const viewHistoryItem = async (
    id: number
  ) => {
    try {
      const response =
        await fetch(
          `${API_BASE_URL}/prescriptions/${id}`
        );

      if (!response.ok) {
        throw new Error(
          "Could not load prescription."
        );
      }

      const data =
        await response.json();

      if (data.success === false) {
        throw new Error(
          data.message ||
            "Could not load prescription."
        );
      }

      const prescription =
        data.prescription || data;

      const patient: Patient = {
        name:
          prescription.patient_name ??
          prescription.patient?.name ??
          null,

        age:
          prescription.patient_age ??
          prescription.patient?.age ??
          null,

        gender:
          prescription.patient_gender ??
          prescription.patient?.gender ??
          null,
      };

      const medicines: Medicine[] =
        prescription.medicines ??
        prescription.medicine_candidates ??
        [];

      setResult({
        success: true,
        message:
          "Prescription loaded from history.",

        filename:
          prescription.filename,

        extracted_text:
          prescription.extracted_text ??
          "",

        patient,

        medicine_candidates:
          medicines,
      });

      setShowHistory(false);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      console.error(
        "View history error:",
        err
      );

      setError(
        "Could not open this prescription."
      );
    }
  };

  // ==============================
  // DELETE HISTORY ITEM
  // ==============================

  const deleteHistoryItem = async (
    id: number
  ) => {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this prescription from history?"
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/prescriptions/${id}`,
          {
            method: "DELETE",
          }
        );

      if (!response.ok) {
        throw new Error(
          "Could not delete prescription."
        );
      }

      setHistory(
        (previous) =>
          previous.filter(
            (item) =>
              item.id !== id
          )
      );
    } catch (err) {
      console.error(
        "Delete history error:",
        err
      );

      setError(
        "Could not delete the prescription."
      );
    }
  };

  // ==============================
  // UPLOAD PRESCRIPTION
  // ==============================

  const analyzePrescription =
    async () => {
      if (!file) {
        setError(
          "Please select a prescription image first."
        );
        return;
      }

      setLoading(true);
      setError("");
      setResult(null);

      setShowStores(false);
      setNearbyStores([]);

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      try {
        const response =
          await fetch(
            `${API_BASE_URL}/analyze-prescription`,
            {
              method: "POST",
              body: formData,
            }
          );

        if (!response.ok) {
          throw new Error(
            `Backend returned ${response.status}`
          );
        }

        const data: PrescriptionResponse =
          await response.json();

        if (!data.success) {
          throw new Error(
            data.message ||
              "Prescription processing failed."
          );
        }

        setResult(data);

        await loadHistory();
      } catch (err) {
        console.error(
          "Prescription upload error:",
          err
        );

        setError(
          "Could not connect to the Healthcare AI backend. Make sure FastAPI is running on port 8000."
        );
      } finally {
        setLoading(false);
      }
    };

  // ==============================
  // RESET
  // ==============================

  const resetAnalysis = () => {
    setFile(null);
    setResult(null);
    setError("");

    setShowStores(false);
    setNearbyStores([]);
    setSelectedMedicine("");

    const input =
      document.getElementById(
        "prescription-file"
      ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  };

  // ==============================
  // DOWNLOAD PDF REPORT
  // ==============================

  const downloadReport =
    async () => {
      if (!result) {
        return;
      }

      try {
        const response =
          await fetch(
            `${API_BASE_URL}/api/prescription/report`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(result),
            }
          );

        if (!response.ok) {
          throw new Error(
            "Could not generate PDF report."
          );
        }

        const blob =
          await response.blob();

        const url =
          window.URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            "a"
          );

        link.href = url;

        link.download =
          "prescription_report.pdf";

        document.body.appendChild(
          link
        );

        link.click();

        link.remove();

        window.URL.revokeObjectURL(
          url
        );
      } catch (err) {
        console.error(
          "PDF error:",
          err
        );

        setError(
          "Could not generate the PDF report. Make sure the FastAPI backend is running."
        );
      }
    };

  // ==============================
  // CALCULATE DISTANCE
  // ==============================

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const earthRadius = 6371;

    const dLat =
      ((lat2 - lat1) *
        Math.PI) /
      180;

    const dLon =
      ((lon2 - lon1) *
        Math.PI) /
      180;

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(
        (lat1 * Math.PI) / 180
      ) *
        Math.cos(
          (lat2 * Math.PI) / 180
        ) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return earthRadius * c;
  };

  // ==============================
  // FIND NEARBY PHARMACIES
  // ==============================

  const findNearbyStores = (
    medicineName: string
  ) => {
    if (!navigator.geolocation) {
      setError(
        "Location services are not supported by this browser."
      );
      return;
    }

    setSelectedMedicine(
      medicineName
    );

    setNearbyStores([]);
    setShowStores(true);
    setStoresLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        try {
          const radius = 5000;

          const query = `
            [out:json];
            (
              node["amenity"="pharmacy"]
                (around:${radius},${latitude},${longitude});

              way["amenity"="pharmacy"]
                (around:${radius},${latitude},${longitude});

              relation["amenity"="pharmacy"]
                (around:${radius},${latitude},${longitude});
            );
            out center tags;
          `;

          const response =
            await fetch(
              "https://overpass-api.de/api/interpreter",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "text/plain",
                },

                body: query,
              }
            );

          if (!response.ok) {
            throw new Error(
              "Could not load nearby pharmacies."
            );
          }

          const data =
            await response.json();

          const stores: NearbyStore[] =
            data.elements
              .map(
                (element: any) => {
                  const lat =
                    element.lat ??
                    element.center
                      ?.lat;

                  const lon =
                    element.lon ??
                    element.center
                      ?.lon;

                  if (
                    lat ===
                      undefined ||
                    lon ===
                      undefined
                  ) {
                    return null;
                  }

                  const tags =
                    element.tags ||
                    {};

                  const name =
                    tags.name ||
                    tags["name:en"] ||
                    "Pharmacy";

                  const addressParts =
                    [
                      tags[
                        "addr:housenumber"
                      ],

                      tags[
                        "addr:street"
                      ],

                      tags[
                        "addr:suburb"
                      ],

                      tags[
                        "addr:city"
                      ],
                    ].filter(
                      Boolean
                    );

                  const address =
                    addressParts.length >
                    0
                      ? addressParts.join(
                          ", "
                        )
                      : "Address not available";

                  const distance =
                    calculateDistance(
                      latitude,
                      longitude,
                      lat,
                      lon
                    );

                  return {
                    id: element.id,
                    name,
                    lat,
                    lon,
                    address,
                    distance,
                  };
                }
              )
              .filter(
                (
                  store: NearbyStore | null
                ): store is NearbyStore =>
                  store !== null
              )
              .sort(
                (
                  a: NearbyStore,
                  b: NearbyStore
                ) =>
                  a.distance -
                  b.distance
              )
              .slice(0, 10);

          setNearbyStores(
            stores
          );
        } catch (err) {
          console.error(
            "Nearby stores error:",
            err
          );

          setError(
            "Could not load nearby pharmacies. Please try again."
          );
        } finally {
          setStoresLoading(false);
        }
      },

      (locationError) => {
        console.error(
          "Location error:",
          locationError
        );

        setStoresLoading(false);

        if (
          locationError.code ===
          locationError.PERMISSION_DENIED
        ) {
          setError(
            "Location permission was denied. Please allow location access and try again."
          );
        } else {
          setError(
            "Could not get your current location."
          );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // ==============================
  // LOAD HISTORY ON START
  // ==============================

  useEffect(() => {
    loadHistory();
  }, []);

  // ==============================
  // RENDER
  // ==============================

  return (
    <div className="app">

      {/* ==========================
          HEADER
      ========================== */}

      <header className="header">

        <div className="logo-section">

          <div className="logo-icon">
            🩺
          </div>

          <div>
            <h1>
              Healthcare AI
            </h1>

            <p>
              Smart Prescription
              Assistant
            </p>
          </div>

        </div>

        <div className="status">

          <span className="status-dot"></span>

          AI System Ready

        </div>

      </header>


      {/* ==========================
          MAIN
      ========================== */}

      <main className="main">

        {/* HERO */}

        <section className="hero">

          <h2>
            Understand Your
            Prescription
          </h2>

          <p>
            Upload a prescription
            image and let Healthcare AI
            extract the information
            for you.
          </p>

        </section>


        {/* ==========================
            HISTORY BUTTON
        ========================== */}

        <section className="history-toggle-section">

          <button
            className="history-button"
            onClick={toggleHistory}
          >

            📋 Prescription History

            {history.length > 0 && (
              <span className="history-count">
                {history.length}
              </span>
            )}

          </button>

        </section>


        {/* ==========================
            HISTORY
        ========================== */}

        {showHistory && (

          <section className="history-section">

            <div className="history-header">

              <div>

                <h2>
                  Prescription History
                </h2>

                <p>
                  Previously analyzed
                  prescriptions
                </p>

              </div>

              <button
                className="history-refresh-button"
                onClick={
                  loadHistory
                }
                disabled={
                  historyLoading
                }
              >
                {historyLoading
                  ? "Loading..."
                  : "↻ Refresh"}
              </button>

            </div>


            {historyLoading ? (

              <div className="history-empty">

                Loading prescription
                history...

              </div>

            ) : history.length ===
              0 ? (

              <div className="history-empty">

                <div className="history-empty-icon">
                  📋
                </div>

                <h3>
                  No prescriptions yet
                </h3>

                <p>
                  Analyze a prescription
                  and it will appear here
                  automatically.
                </p>

              </div>

            ) : (

              <div className="history-list">

                {history.map(
                  (item) => (

                    <div
                      className="history-card"
                      key={item.id}
                    >

                      <div className="history-card-main">

                        <div className="history-file-icon">
                          📄
                        </div>

                        <div className="history-info">

                          <h3>
                            {item.patient_name ||
                              "Patient not detected"}
                          </h3>

                          <p>
                            {item.filename ||
                              "Prescription"}
                          </p>

                          <div className="history-meta">

                            {item.patient_age !==
                              null &&
                              item.patient_age !==
                                undefined && (
                                <span>
                                  Age:{" "}
                                  {
                                    item.patient_age
                                  }
                                </span>
                              )}

                            {item.patient_gender && (
                              <span>
                                {
                                  item.patient_gender
                                }
                              </span>
                            )}

                            <span>
                              💊{" "}
                              {item.medicines?.length ||
                                0}{" "}
                              medicines
                            </span>

                          </div>

                          {item.created_at && (

                            <small>
                              Analyzed:{" "}
                              {new Date(
                                item.created_at
                              ).toLocaleString()}
                            </small>

                          )}

                        </div>

                      </div>


                      <div className="history-actions">

                        <button
                          className="view-history-button"
                          onClick={() =>
                            viewHistoryItem(
                              item.id
                            )
                          }
                        >
                          👁 View
                        </button>

                        <button
                          className="delete-history-button"
                          onClick={() =>
                            deleteHistoryItem(
                              item.id
                            )
                          }
                        >
                          🗑 Delete
                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            )}

          </section>

        )}


        {/* ==========================
            UPLOAD CARD
        ========================== */}

        <section className="upload-card">

          <div className="upload-icon">
            📄
          </div>

          <h3>
            Upload Prescription
          </h3>

          <p>
            Supported formats:
            JPG, PNG, WEBP
          </p>


          <div className="upload-area">

            <input
              id="prescription-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={
                handleFileChange
              }
            />


            <label
              htmlFor="prescription-file"
              className="upload-box"
            >

              <div className="upload-icon">
                📄
              </div>

              <h3>
                Upload Prescription
              </h3>

              <p>
                Drag & drop your
                prescription here
              </p>

              <span>
                or
              </span>

              <div className="choose-file-btn">
                Choose Prescription
              </div>

              <small>
                JPG, PNG or WEBP •
                Maximum recommended
                size 10 MB
              </small>

            </label>

          </div>


          {file && (

            <div className="selected-file">

              <strong>
                Selected file:
              </strong>

              <span>
                {file.name}
              </span>

            </div>

          )}


          <button
            className="analyze-button"
            onClick={
              analyzePrescription
            }
            disabled={
              !file || loading
            }
          >
            {loading
              ? "Analyzing..."
              : "Analyze Prescription"}
          </button>


          {file && !loading && (

            <button
              className="reset-button"
              onClick={
                resetAnalysis
              }
            >
              Remove File
            </button>

          )}

        </section>


        {/* ==========================
            ERROR
        ========================== */}

        {error && (

          <div className="error-box">
            ⚠️ {error}
          </div>

        )}


        {/* ==========================
            RESULTS
        ========================== */}

        {result &&
          result.success && (

            <section className="results">

              <div className="results-header">

                <div>

                  <h2>
                    Prescription Analysis
                  </h2>

                  <p>
                    Successfully
                    processed:
                    {" "}
                    {result.filename}
                  </p>

                </div>


                <button
                  className="download-button"
                  onClick={
                    downloadReport
                  }
                >
                  Download PDF
                </button>

              </div>


              {/* ==================
                  PATIENT
              ================== */}

              <div className="result-card">

                <h3>
                  Patient Information
                </h3>

                <div className="patient-grid">

                  <div className="info-item">

                    <span>
                      Name:
                    </span>

                    <strong>
                      {result.patient
                        ?.name ||
                        "Not detected"}
                    </strong>

                  </div>


                  <div className="info-item">

                    <span>
                      Age:
                    </span>

                    <strong>

                      {result.patient
                        ?.age !== null &&
                      result.patient
                        ?.age !== undefined
                        ? `${result.patient.age} years`
                        : "Not detected"}

                    </strong>

                  </div>


                  <div className="info-item">

                    <span>
                      Gender:
                    </span>

                    <strong>
                      {result.patient
                        ?.gender ||
                        "Not detected"}
                    </strong>

                  </div>

                </div>

              </div>


              {/* ==================
                  MEDICINES
              ================== */}

              <div className="result-card">

                <h3>
                  Detected Medicines
                </h3>


                {result.medicine_candidates &&
                result.medicine_candidates
                  .length > 0 ? (

                  <div className="medicine-list">

                    {result.medicine_candidates.map(
                      (
                        medicine,
                        index
                      ) => (

                        <div
                          className="medicine-card"
                          key={`${medicine.name}-${index}`}
                        >

                          <div className="medicine-header">

                            <div>

                              <h4>
                                {medicine.name}
                              </h4>

                              <p>
                                OCR detected:
                                {" "}
                                {
                                  medicine.ocr_match
                                }
                              </p>

                            </div>


                            <span className="confidence">

                              {Math.round(
                                medicine.confidence *
                                  100
                              )}

                              %

                            </span>

                          </div>


                          <div className="medicine-details">

                            <div>

                              <span>
                                Dosage:
                              </span>

                              <strong>
                                {medicine.dosage ||
                                  "Not detected"}
                              </strong>

                            </div>


                            <div>

                              <span>
                                Frequency:
                              </span>

                              <strong>
                                {medicine.frequency ||
                                  "Not detected"}
                              </strong>

                            </div>


                            <div>

                              <span>
                                Duration:
                              </span>

                              <strong>
                                {medicine.duration ||
                                  "Not detected"}
                              </strong>

                            </div>


                            <div>

                              <span>
                                Instructions:
                              </span>

                              <strong>
                                {medicine.instructions ||
                                  "Not detected"}
                              </strong>

                            </div>

                          </div>


                          <div className="verification">

                            {medicine.verified
                              ? "✓ Verified"
                              : "⚠ Pending verification"}

                          </div>


                          {/* FIND STORES */}

                          <button
                            className="store-button"
                            onClick={() =>
                              findNearbyStores(
                                medicine.name
                              )
                            }
                          >
                            📍 Find Nearby Stores
                          </button>

                        </div>

                      )
                    )}

                  </div>

                ) : (

                  <p className="no-results">
                    No medicines were
                    detected.
                  </p>

                )}

              </div>


              {/* ==================
                  NEARBY STORES
              ================== */}

              {showStores && (

                <div className="nearby-stores-section">

                  <div className="nearby-stores-header">

                    <div>

                      <h2>
                        📍 Nearby Pharmacies
                      </h2>

                      <p>
                        Pharmacies near
                        your current
                        location
                      </p>

                      {selectedMedicine && (

                        <div className="medicine-search-label">

                          Searching for:
                          {" "}

                          <strong>
                            {selectedMedicine}
                          </strong>

                        </div>

                      )}

                    </div>


                    <button
                      className="close-stores-button"
                      onClick={() => {
                        setShowStores(
                          false
                        );

                        setNearbyStores(
                          []
                        );
                      }}
                    >
                      ✕ Close
                    </button>

                  </div>


                  {/* LOADING */}

                  {storesLoading && (

                    <div className="stores-loading">

                      <div className="loading-icon">
                        📍
                      </div>

                      <h3>
                        Finding nearby
                        pharmacies...
                      </h3>

                      <p>
                        Searching within
                        approximately
                        5 km of your
                        location.
                      </p>

                    </div>

                  )}


                  {/* EMPTY */}

                  {!storesLoading &&
                    nearbyStores.length ===
                      0 && (

                      <div className="stores-empty">

                        <div className="stores-empty-icon">
                          🏥
                        </div>

                        <h3>
                          No nearby
                          pharmacies found
                        </h3>

                        <p>
                          We couldn't
                          find pharmacies
                          in the nearby
                          map data.
                        </p>

                      </div>

                    )}


                  {/* STORE LIST */}

                  {!storesLoading &&
                    nearbyStores.length >
                      0 && (

                      <div className="nearby-store-list">

                        {nearbyStores.map(
                          (
                            store,
                            index
                          ) => (

                            <div
                              className="nearby-store-card"
                              key={`${store.id}-${index}`}
                            >

                              <div className="store-number">
                                {index + 1}
                              </div>


                              <div className="store-main">

                                <div className="store-title-row">

                                  <div>

                                    <h3>
                                      🏥{" "}
                                      {store.name}
                                    </h3>

                                    <span className="store-distance">

                                      📏{" "}

                                      {store.distance <
                                      1
                                        ? `${Math.round(
                                            store.distance *
                                              1000
                                          )} m away`
                                        : `${store.distance.toFixed(
                                            1
                                          )} km away`}

                                    </span>

                                  </div>

                                </div>


                                <p className="store-address">
                                  📍{" "}
                                  {
                                    store.address
                                  }
                                </p>


                                <div className="store-actions">

                                  <a
                                    className="map-button"
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lon}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    🗺️ Get Directions
                                  </a>


                                  <a
                                    className="view-map-button"
                                    href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lon}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View on Map
                                  </a>

                                </div>


                                <div className="stock-warning">

                                  ⚠️ Medicine
                                  availability is
                                  not verified.
                                  Please contact
                                  the pharmacy
                                  before visiting.

                                </div>

                              </div>

                            </div>

                          )
                        )}

                      </div>

                    )}

                </div>

              )}


              {/* ==================
                  OCR TEXT
              ================== */}

              <div className="result-card">

                <h3>
                  Extracted Prescription
                  Text
                </h3>

                <pre className="ocr-text">

                  {result.extracted_text ||
                    "No OCR text available."}

                </pre>

              </div>


              {/* ==================
                  DISCLAIMER
              ================== */}

              <div className="disclaimer">

                <strong>
                  Important:
                </strong>

                <p>
                  This system extracts
                  information from
                  prescription images
                  using OCR and
                  automated processing.
                  It may contain errors.
                  Always compare the
                  extracted information
                  with the original
                  prescription and verify
                  it with a qualified
                  healthcare professional.
                </p>

                <p>
                  This application does
                  not provide medical
                  diagnosis or treatment
                  recommendations.
                </p>

                <p>
                  Nearby pharmacy
                  locations are provided
                  using map data.
                  Medicine stock is not
                  verified by this
                  application.
                </p>

              </div>

            </section>

          )}

      </main>


      {/* ==========================
          FOOTER
      ========================== */}

      <footer className="footer">

        <p>
          Healthcare AI • Prescription
          Assistant
        </p>

      </footer>

    </div>
  );
}

export default App;