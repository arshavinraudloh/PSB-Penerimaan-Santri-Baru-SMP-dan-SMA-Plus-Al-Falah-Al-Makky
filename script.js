"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

/* GANTI KONFIGURASI INI DENGAN KONFIGURASI FIREBASE MILIKMU */

const firebaseConfig = {
    apiKey: "GANTI_API_KEY",
    authDomain: "GANTI_PROJECT_ID.firebaseapp.com",
    projectId: "GANTI_PROJECT_ID",
    storageBucket: "GANTI_STORAGE_BUCKET",
    messagingSenderId: "GANTI_MESSAGING_SENDER_ID",
    appId: "GANTI_APP_ID"
};

const $ = selector => document.querySelector(selector);

const form = $("#registrationForm");
const submitButton = $("#submitButton");
const formStatus = $("#formStatus");
const yearSelect = $("#academicYear");
const heroYear = $("#heroYear");
const fileInput = $("#documents");

let app;
let auth;
let db;
let storage;
let firebaseReady = false;
let adminRecords = [];

const years = [];

for (let year = 2026; year <= 2035; year++) {
    years.push(`${year}/${year + 1}`);
}

/* STATUS PESAN */

function setStatus(element, message, error = false) {
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.toggle("success", !error && Boolean(message));
}

/* TAHUN AJARAN */

function renderYears(selectedYear = "2027/2028") {
    yearSelect.replaceChildren();

    years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });

    if (!years.includes(selectedYear)) {
        const option = document.createElement("option");
        option.value = selectedYear;
        option.textContent = selectedYear;
        yearSelect.appendChild(option);
    }

    yearSelect.value = selectedYear;
    heroYear.textContent = selectedYear;
}

renderYears();
$("#currentYear").textContent = new Date().getFullYear();

yearSelect.addEventListener("change", () => {
    heroYear.textContent = yearSelect.value;
});

/* INISIALISASI FIREBASE */

try {
    const missingConfig = Object.values(firebaseConfig).some(value =>
        String(value).startsWith("GANTI_")
    );

    if (!missingConfig) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        firebaseReady = true;
    }
} catch (error) {
    console.error("Firebase gagal diinisialisasi:", error);
}

if (!firebaseReady) {
    setStatus(
        formStatus,
        "Firebase belum dikonfigurasi. Isi firebaseConfig sebelum menerima pendaftaran.",
        true
    );
}

/* PENGATURAN TAHUN AJARAN GLOBAL */

async function loadGlobalSettings() {
    if (!firebaseReady) return;

    try {
        const snapshot = await getDoc(doc(db, "settings", "psb"));

        if (snapshot.exists()) {
            const year = snapshot.data().academicYear;

            if (/^\d{4}\/\d{4}$/.test(year || "")) {
                renderYears(year);
            }
        }
    } catch (error) {
        console.error("Gagal memuat tahun ajaran:", error);
    }
}

/* NOMOR REGISTRASI */

function makeRegistrationNumber() {
    const date = new Date();

    const dateCode =
        date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, "0") +
        String(date.getDate()).padStart(2, "0");

    const random = crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 6)
        .toUpperCase();

    return `PSB-${dateCode}-${random}`;
}

/* DATA FORMULIR */

function getFormData() {
    const raw = Object.fromEntries(new FormData(form).entries());

    return {
        academicYear: String(raw.academicYear || ""),
        level: String(raw.level || ""),
        program: String(raw.program || ""),
        fullName: String(raw.fullName || "").trim(),
        birthPlace: String(raw.birthPlace || "").trim(),
        birthDate: String(raw.birthDate || ""),
        gender: String(raw.gender || ""),
        nisn: String(raw.nisn || "").trim(),
        address: String(raw.address || "").trim(),
        previousSchool: String(raw.previousSchool || "").trim(),
        lastGrade: String(raw.lastGrade || "").trim(),
        guardianName: String(raw.guardianName || "").trim(),
        guardianRelation: String(raw.guardianRelation || ""),
        guardianPhone: String(raw.guardianPhone || "").trim(),
        guardianEmail: String(raw.guardianEmail || "").trim()
    };
}

/* VALIDASI DOKUMEN */

function validateFiles(files) {
    const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png"
    ];

    if (files.length > 3) {
        throw new Error("Maksimal 3 dokumen.");
    }

    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            throw new Error(
                `Format ${file.name} tidak didukung. Gunakan PDF, JPG, atau PNG.`
            );
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new Error(`${file.name} melebihi batas 5 MB.`);
        }
    }
}

fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];

    $("#fileSummary").textContent = files.length
        ? `${files.length} file dipilih: ${files.map(file => file.name).join(", ")}`
        : "Belum ada file dipilih.";
});

/* UNGGAH DOKUMEN */

async function uploadDocuments(files, uid, registrationNumber) {
    const documents = [];

    for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

        const storageRef = ref(
            storage,
            `applications/${uid}/${registrationNumber}/${Date.now()}_${safeName}`
        );

        await uploadBytes(storageRef, file, {
            contentType: file.type
        });

        const url = await getDownloadURL(storageRef);

        documents.push({
            name: file.name,
            path: storageRef.fullPath,
            url,
            contentType: file.type,
            size: file.size
        });
    }

    return documents;
}

/* KIRIM PENDAFTARAN */

form.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus(formStatus, "");

    if (!form.reportValidity()) return;

    if (!firebaseReady) {
        setStatus(
            formStatus,
            "Pendaftaran belum dapat dikirim karena Firebase belum dikonfigurasi.",
            true
        );
        return;
    }

    const files = [...fileInput.files];

    try {
        validateFiles(files);
    } catch (error) {
        setStatus(formStatus, error.message, true);
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Mengirim pendaftaran...";

    try {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

        const user = auth.currentUser;

        if (!user) {
            throw new Error("Sesi tidak tersedia. Muat ulang halaman.");
        }

        const registrationNumber = makeRegistrationNumber();
        const data = getFormData();

        const documents = files.length
            ? await uploadDocuments(files, user.uid, registrationNumber)
            : [];

        await addDoc(collection(db, "applications"), {
            ...data,
            registrationNumber,
            documents,
            submittedByUid: user.uid,
            status: "Menunggu verifikasi",
            createdAt: serverTimestamp()
        });

        $("#registrationNumber").textContent = registrationNumber;

        form.reset();
        renderYears();
        $("#fileSummary").textContent = "Belum ada file dipilih.";

        $("#successDialog").showModal();

        setStatus(
            formStatus,
            "Pendaftaran berhasil dikirim. Simpan nomor registrasi."
        );

    } catch (error) {
        console.error(error);

        let message = "Pendaftaran gagal. Periksa koneksi internet dan konfigurasi Firebase.";

        if (error.code === "permission-denied") {
            message = "Akses database ditolak. Periksa Firestore Rules.";
        } else if (error.code === "storage/unauthorized") {
            message = "Unggah dokumen ditolak. Periksa Storage Rules.";
        } else if (error.message) {
            message = error.message;
        }

        setStatus(formStatus, message, true);

    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = "Kirim Pendaftaran →";
    }
});

/* TOMBOL FORMULIR */

form.addEventListener("reset", () => {
    setStatus(formStatus, "");

    setTimeout(() => {
        renderYears();
        $("#fileSummary").textContent = "Belum ada file dipilih.";
    }, 0);
});

$("#closeSuccess").addEventListener("click", () => {
    $("#successDialog").close();
});

/* MENU PONSEL */

$("#menuToggle").addEventListener("click", () => {
    $("#navigation").classList.toggle("open");
});

$("#navigation").querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        $("#navigation").classList.remove("open");
    });
});

/* DASHBOARD ADMIN */

$("#openAdmin").addEventListener("click", () => {
    $("#adminPanel").hidden = false;
    $("#adminPanel").scrollIntoView({ behavior: "smooth" });
});

async function isAdmin() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        return false;
    }

    const snapshot = await getDoc(
        doc(db, "admins", auth.currentUser.uid)
    );

    return snapshot.exists() && snapshot.data().active === true;
}

$("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!firebaseReady) {
        setStatus($("#adminStatus"), "Firebase belum dikonfigurasi.", true);
        return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));

    try {
        await signInWithEmailAndPassword(auth, email, password);

        if (!(await isAdmin())) {
            await signOut(auth);
            throw new Error("Akun ini belum diberi izin admin.");
        }

        $("#adminLoginBox").hidden = true;
        $("#adminDataBox").hidden = false;

        await loadGlobalSettings();
        $("#adminAcademicYear").value = yearSelect.value;

        await loadAdminData();

        setStatus($("#adminStatus"), "");

    } catch (error) {
        setStatus(
            $("#adminStatus"),
            error.message || "Login gagal. Periksa akun admin.",
            true
        );
    }
});

/* PENGATURAN TAHUN AJARAN */

$("#saveAcademicYear").addEventListener("click", async () => {
    const value = $("#adminAcademicYear").value.trim();

    if (!/^\d{4}\/\d{4}$/.test(value)) {
        setStatus(
            $("#adminStatus"),
            "Format tahun ajaran harus seperti 2027/2028.",
            true
        );
        return;
    }

    try {
        if (!(await isAdmin())) {
            throw new Error("Akses admin tidak valid.");
        }

        await setDoc(doc(db, "settings", "psb"), {
            academicYear: value,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser.uid
        });

        renderYears(value);

        setStatus(
            $("#adminStatus"),
            `Tahun ajaran aktif diubah menjadi ${value}.`
        );

    } catch (error) {
        setStatus(
            $("#adminStatus"),
            error.message || "Gagal menyimpan tahun ajaran.",
            true
        );
    }
});

/* MUAT DATA PENDAFTAR */

async function loadAdminData() {
    if (!(await isAdmin())) {
        throw new Error("Akses admin tidak valid.");
    }

    const snapshot = await getDocs(
        query(
            collection(db, "applications"),
            orderBy("createdAt", "desc")
        )
    );

    adminRecords = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
    }));

    renderAdminTable();
}

function renderAdminTable() {
    const search = $("#adminSearch").value.toLowerCase().trim();

    const filtered = adminRecords.filter(row => {
        return [
            row.registrationNumber,
            row.fullName,
            row.guardianPhone,
            row.level,
            row.academicYear
        ].some(value =>
            String(value || "").toLowerCase().includes(search)
        );
    });

    const body = $("#adminTableBody");
    body.replaceChildren();

    filtered.forEach(row => {
        const tr = document.createElement("tr");

        const date = row.createdAt?.toDate
            ? row.createdAt.toDate().toLocaleDateString("id-ID")
            : "—";

        [
            row.registrationNumber,
            row.fullName,
            row.level,
            row.academicYear,
            row.guardianPhone,
            date
        ].forEach(value => {
            const td = document.createElement("td");
            td.textContent = value || "—";
            tr.appendChild(td);
        });

        body.appendChild(tr);
    });

    $("#adminCount").textContent =
        `${filtered.length} pendaftar ditampilkan dari ${adminRecords.length} data.`;
}

$("#adminSearch").addEventListener("input", renderAdminTable);

$("#refreshAdmin").addEventListener("click", async () => {
    try {
        await loadAdminData();
        setStatus($("#adminStatus"), "Data berhasil diperbarui.");
    } catch (error) {
        setStatus($("#adminStatus"), error.message, true);
    }
});

/* EKSPOR CSV */

$("#exportCsv").addEventListener("click", () => {
    if (!adminRecords.length) {
        setStatus($("#adminStatus"), "Belum ada data untuk diekspor.", true);
        return;
    }

    const columns = [
        "registrationNumber",
        "academicYear",
        "level",
        "program",
        "fullName",
        "birthPlace",
        "birthDate",
        "gender",
        "nisn",
        "address",
        "previousSchool",
        "lastGrade",
        "guardianName",
        "guardianRelation",
        "guardianPhone",
        "guardianEmail",
        "status"
    ];

    const escapeCsv = value =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
        columns.join(","),
        ...adminRecords.map(row =>
            columns.map(key => escapeCsv(row[key])).join(",")
        )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "data-psb-santri.csv";
    link.click();

    URL.revokeObjectURL(url);
});

/* LOGOUT */

$("#adminSignOut").addEventListener("click", async () => {
    if (auth?.currentUser) {
        await signOut(auth);
    }

    $("#adminLoginBox").hidden = false;
    $("#adminDataBox").hidden = true;

    adminRecords = [];
    $("#adminTableBody").replaceChildren();

    setStatus($("#adminStatus"), "Berhasil keluar.");
});

/* PEMERIKSAAN SESI ADMIN */

if (firebaseReady) {
    loadGlobalSettings();

    onAuthStateChanged(auth, async user => {
        if (!user || user.isAnonymous) {
            $("#adminLoginBox").hidden = false;
            $("#adminDataBox").hidden = true;
            return;
        }

        try {
            if (await isAdmin()) {
                $("#adminLoginBox").hidden = true;
                $("#adminDataBox").hidden = false;

                await loadGlobalSettings();
                $("#adminAcademicYear").value = yearSelect.value;

                await loadAdminData();
            } else {
                $("#adminLoginBox").hidden = false;
                $("#adminDataBox").hidden = true;
            }
        } catch (error) {
            console.error("Pemeriksaan admin gagal:", error);
        }
    });
}
