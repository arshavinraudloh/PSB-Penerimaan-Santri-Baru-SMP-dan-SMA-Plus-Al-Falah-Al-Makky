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

/* =====================================
   1. KONFIGURASI FIREBASE
===================================== */

const firebaseConfig = {
    apiKey: "AIzaSyDNNuO654Uf846ZSGMd3WfSdHdUGOKsHcs",
    authDomain: "psb-penerimaan-santri-baru.firebaseapp.com",
    projectId: "psb-penerimaan-santri-baru",
    storageBucket: "psb-penerimaan-santri-baru.firebasestorage.app",
    messagingSenderId: "569419184425",
    appId: "1:569419184425:web:456d6b0717c297526c1f38",
    measurementId: "G-MMS55XSN6L"
};

const $ = selector => document.querySelector(selector);

const form = $("#registrationForm");
const submitButton = $("#submitButton");
const formStatus = $("#formStatus");

let app;
let auth;
let db;
let firebaseReady = false;
let adminRecords = [];
let activeYearStart = String(new Date().getFullYear());
let adminRequestInProgress = false;

/* =====================================
   2. STATUS PESAN
===================================== */

function setStatus(element, message, isError = false) {
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.toggle("success", !isError && Boolean(message));
}

/* =====================================
   3. TAHUN AJARAN
===================================== */

function populateYearSelect(select, selectedValue = "") {
    if (!select) return;

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih tahun";
    select.appendChild(placeholder);

    const currentYear = new Date().getFullYear();

    for (let year = currentYear - 1; year <= currentYear + 10; year++) {
        const option = document.createElement("option");

        option.value = String(year);
        option.textContent = String(year);

        select.appendChild(option);
    }

    if (
        selectedValue &&
        ![...select.options].some(option => option.value === selectedValue)
    ) {
        const option = document.createElement("option");

        option.value = selectedValue;
        option.textContent = selectedValue;

        select.appendChild(option);
    }

    select.value = selectedValue;
}

const yearStart = $("#academicYearStart");
const yearEnd = $("#academicYearEnd");

populateYearSelect(yearStart, activeYearStart);
populateYearSelect(yearEnd, String(Number(activeYearStart) + 1));

yearStart.addEventListener("change", () => {
    const start = Number(yearStart.value);

    if (!start) {
        populateYearSelect(yearEnd);
        return;
    }

    populateYearSelect(yearEnd, String(start + 1));
});

$("#currentYear").textContent = new Date().getFullYear();

/* =====================================
   4. INISIALISASI FIREBASE
===================================== */

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    firebaseReady = true;
} catch (error) {
    console.error("Firebase gagal diinisialisasi:", error);

    setStatus(
        formStatus,
        "Koneksi Firebase gagal. Periksa konfigurasi proyek.",
        true
    );
}

/* =====================================
   5. MEMUAT TAHUN AJARAN AKTIF
===================================== */

async function loadGlobalSettings() {
    if (!firebaseReady) return;

    try {
        const snapshot = await getDoc(doc(db, "settings", "psb"));

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const year = Number(data.academicYearStart);

        if (
            Number.isInteger(year) &&
            year >= 2000 &&
            year <= 9998
        ) {
            activeYearStart = String(year);

            populateYearSelect(yearStart, activeYearStart);
            populateYearSelect(yearEnd, String(year + 1));
        }
    } catch (error) {
        console.error("Gagal memuat pengaturan tahun ajaran:", error);
    }
}

/* =====================================
   6. NOMOR REGISTRASI
===================================== */

function makeRegistrationNumber() {
    const now = new Date();

    const dateCode =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0");

    const random = crypto.randomUUID()
        .replaceAll("-", "")
        .slice(0, 8)
        .toUpperCase();

    return `PSB-${dateCode}-${random}`;
}

/* =====================================
   7. MENGAMBIL DATA FORMULIR
===================================== */

function getFormData() {
    const raw = Object.fromEntries(new FormData(form).entries());

    const start = String(raw.academicYearStart || "");
    const end = String(raw.academicYearEnd || "");

    if (Number(end) !== Number(start) + 1) {
        throw new Error(
            "Tahun ajaran akhir harus satu tahun setelah tahun awal."
        );
    }

    return {
        fullName: String(raw.fullName || "").trim(),
        gender: String(raw.gender || ""),
        birthPlace: String(raw.birthPlace || "").trim(),
        birthDate: String(raw.birthDate || ""),
        previousSchool: String(raw.previousSchool || "").trim(),
        level: String(raw.level || ""),
        guardianPhone: String(raw.guardianPhone || "").trim(),
        academicYearStart: start,
        academicYearEnd: end,
        academicYear: `${start}/${end}`,
        program: String(raw.program || ""),
        address: String(raw.address || "").trim(),
        guardianName: String(raw.guardianName || "").trim(),
        guardianEmail: String(raw.guardianEmail || "").trim()
    };
}

/* =====================================
   8. MENGIRIM BIODATA
===================================== */

form.addEventListener("submit", async event => {
    event.preventDefault();

    setStatus(formStatus, "");

    if (!form.reportValidity()) return;

    if (!firebaseReady) {
        setStatus(
            formStatus,
            "Firebase belum siap. Periksa konfigurasi.",
            true
        );
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Mengirim biodata...";

    try {
        const data = getFormData();

        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

        const user = auth.currentUser;

        if (!user) {
            throw new Error("Sesi pengguna tidak tersedia. Muat ulang halaman.");
        }

        const registrationNumber = makeRegistrationNumber();

        await addDoc(collection(db, "applications"), {
            ...data,
            registrationNumber,
            submittedByUid: user.uid,
            status: "Menunggu verifikasi",
            createdAt: serverTimestamp()
        });

        $("#registrationNumber").textContent = registrationNumber;

        form.reset();

        populateYearSelect(yearStart, activeYearStart);
        populateYearSelect(yearEnd, String(Number(activeYearStart) + 1));

        $("#successDialog").showModal();

        setStatus(
            formStatus,
            "Biodata berhasil dikirim. Simpan nomor registrasi."
        );
    } catch (error) {
        console.error("Gagal mengirim biodata:", error);

        let message = "Pendaftaran gagal. Silakan coba kembali.";

        if (
            error.code === "permission-denied" ||
            error.code === "firestore/permission-denied"
        ) {
            message = "Akses database ditolak. Periksa Firestore Rules.";
        } else if (error.code === "auth/operation-not-allowed") {
            message = "Aktifkan Anonymous di Firebase Authentication.";
        } else if (error.code === "auth/network-request-failed") {
            message = "Koneksi internet bermasalah.";
        } else if (error.message) {
            message = error.message;
        }

        setStatus(formStatus, message, true);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = "<span>➤</span> Kirim Biodata";
    }
});

/* =====================================
   9. PILIH PROGRAM
===================================== */

document.querySelectorAll("[data-program]").forEach(button => {
    button.addEventListener("click", () => {
        $("#program").value = button.dataset.program;

        $("#pendaftaran").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        $("#program").focus({ preventScroll: true });
    });
});

/* =====================================
   10. DIALOG SUKSES
===================================== */

$("#closeSuccess").addEventListener("click", () => {
    $("#successDialog").close();
});

/* =====================================
   11. NAVIGASI HP
===================================== */

$("#menuToggle").addEventListener("click", () => {
    $("#navigation").classList.toggle("open");
});

$("#navigation").querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        $("#navigation").classList.remove("open");
    });
});

/* =====================================
   12. BUKA DASHBOARD ADMIN
===================================== */

$("#openAdmin").addEventListener("click", () => {
    $("#adminPanel").hidden = false;

    $("#adminPanel").scrollIntoView({
        behavior: "smooth"
    });
});

/* =====================================
   13. PEMERIKSAAN HAK ADMIN
===================================== */

async function isAdmin() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        return false;
    }

    const snapshot = await getDoc(
        doc(db, "admins", auth.currentUser.uid)
    );

    return snapshot.exists() && snapshot.data().active === true;
}

/* =====================================
   14. LOGIN ADMIN
===================================== */

$("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!firebaseReady) {
        setStatus($("#adminStatus"), "Firebase belum siap.", true);
        return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
        await signInWithEmailAndPassword(auth, email, password);

        if (!(await isAdmin())) {
            await signOut(auth);

            throw new Error(
                "Akun belum terdaftar sebagai admin. Periksa UID dan field active."
            );
        }

        $("#adminLoginBox").hidden = true;
        $("#adminDataBox").hidden = false;
        $("#adminSignOut").hidden = false;

        await loadAdminData();

        setStatus($("#adminStatus"), "");
    } catch (error) {
        console.error("Login admin gagal:", error);

        let message = error.message || "Login gagal.";

        if (error.code === "auth/invalid-credential") {
            message = "Email atau kata sandi tidak sesuai.";
        } else if (error.code === "auth/too-many-requests") {
            message = "Terlalu banyak percobaan. Coba kembali nanti.";
        } else if (
            error.code === "permission-denied" ||
            error.code === "firestore/permission-denied"
        ) {
            message =
                "Akses ditolak. Periksa dokumen admins dan Firestore Rules.";
        }

        setStatus($("#adminStatus"), message, true);
    }
});

/* =====================================
   15. MEMUAT DATA PENDAFTAR
===================================== */

async function loadAdminData() {
    if (adminRequestInProgress) return;

    adminRequestInProgress = true;

    try {
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
    } finally {
        adminRequestInProgress = false;
    }
}

/* =====================================
   16. MENAMPILKAN TABEL
===================================== */

function renderAdminTable() {
    const search = $("#adminSearch").value.toLowerCase().trim();

    const filtered = adminRecords.filter(row => {
        const text = [
            row.registrationNumber,
            row.fullName,
            row.previousSchool,
            row.guardianPhone,
            row.level,
            row.program,
            row.academicYear
        ].join(" ").toLowerCase();

        return text.includes(search);
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
            row.program,
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
        setStatus(
            $("#adminStatus"),
            error.message || "Gagal memuat data.",
            true
        );
    }
});

/* =====================================
   17. EKSPOR CSV
===================================== */

$("#exportCsv").addEventListener("click", () => {
    if (!adminRecords.length) {
        setStatus($("#adminStatus"), "Belum ada data untuk diekspor.", true);
        return;
    }

    const columns = [
        "registrationNumber",
        "fullName",
        "gender",
        "birthPlace",
        "birthDate",
        "previousSchool",
        "level",
        "program",
        "academicYear",
        "guardianPhone",
        "address",
        "guardianName",
        "guardianEmail",
        "status"
    ];

    const escapeCsv = value => {
        let text = String(value ?? "");

        if (/^[=+\-@\t\r]/.test(text)) {
            text = "'" + text;
        }

        return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
        columns.map(escapeCsv).join(","),
        ...adminRecords.map(row =>
            columns.map(key => escapeCsv(row[key])).join(",")
        )
    ].join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "data-psb-al-falah-al-makky.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});

/* =====================================
   18. LOGOUT ADMIN
===================================== */

$("#adminSignOut").addEventListener("click", async () => {
    try {
        await signOut(auth);

        adminRecords = [];
        $("#adminTableBody").replaceChildren();

        $("#adminLoginBox").hidden = false;
        $("#adminDataBox").hidden = true;
        $("#adminSignOut").hidden = true;

        setStatus($("#adminStatus"), "Berhasil keluar dari dashboard.");
    } catch (error) {
        console.error("Logout gagal:", error);

        setStatus($("#adminStatus"), "Gagal keluar. Coba kembali.", true);
    }
});

/* =====================================
   19. PEMERIKSAAN SESI ADMIN
===================================== */

if (firebaseReady) {
    loadGlobalSettings();

    onAuthStateChanged(auth, async user => {
        if (!user || user.isAnonymous) {
            $("#adminLoginBox").hidden = false;
            $("#adminDataBox").hidden = true;
            $("#adminSignOut").hidden = true;
            return;
        }

        try {
            if (await isAdmin()) {
                $("#adminLoginBox").hidden = true;
                $("#adminDataBox").hidden = false;
                $("#adminSignOut").hidden = false;

                await loadAdminData();
            } else {
                $("#adminLoginBox").hidden = false;
                $("#adminDataBox").hidden = true;
                $("#adminSignOut").hidden = true;
            }
        } catch (error) {
            console.error("Pemeriksaan admin gagal:", error);

            $("#adminLoginBox").hidden = false;
            $("#adminDataBox").hidden = true;
            $("#adminSignOut").hidden = true;
        }
    });
}
