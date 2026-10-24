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

/* =========================================
   1. KONFIGURASI FIREBASE
========================================= */

const firebaseConfig = {
    apiKey: "AIzaSyDNNuO654Uf846ZSGMd3WfSdHdUGOKsHcs",
    authDomain: "psb-penerimaan-santri-baru.firebaseapp.com",
    projectId: "psb-penerimaan-santri-baru",
    storageBucket: "psb-penerimaan-santri-baru.firebasestorage.app",
    messagingSenderId: "569419184425",
    appId: "1:569419184425:web:456d6b0717c297526c1f38",
    measurementId: "G-MMS55XSN6L"
};

/* =========================================
   2. ELEMEN HTML
========================================= */

const $ = selector => document.querySelector(selector);

const form = $("#registrationForm");
const submitButton = $("#submitButton");
const formStatus = $("#formStatus");
const yearSelect = $("#academicYear");
const heroYear = $("#heroYear");

let app;
let auth;
let db;
let firebaseReady = false;
let adminRecords = [];
let activeAcademicYear = "2027/2028";

/* =========================================
   3. STATUS PESAN
========================================= */

function setStatus(element, message, error = false) {
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.toggle("success", !error && Boolean(message));
}

/* =========================================
   4. TAHUN AJARAN
========================================= */

const years = [];

for (let year = 2026; year <= 2035; year++) {
    years.push(`${year}/${year + 1}`);
}

function renderYears(selectedYear = activeAcademicYear) {
    if (!yearSelect) return;

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

    if (heroYear) {
        heroYear.textContent = selectedYear;
    }
}

renderYears();

if ($("#currentYear")) {
    $("#currentYear").textContent = new Date().getFullYear();
}

yearSelect.addEventListener("change", () => {
    if (heroYear) {
        heroYear.textContent = yearSelect.value;
    }
});

/* =========================================
   5. INISIALISASI FIREBASE
========================================= */

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    firebaseReady = true;

} catch (error) {
    console.error("Firebase gagal diinisialisasi:", error);

    setStatus(
        formStatus,
        "Firebase gagal diinisialisasi. Periksa konfigurasi Firebase.",
        true
    );
}

/* =========================================
   6. MEMUAT PENGATURAN TAHUN AJARAN
========================================= */

async function loadGlobalSettings() {
    if (!firebaseReady) return;

    try {
        const snapshot = await getDoc(doc(db, "settings", "psb"));

        if (snapshot.exists()) {
            const data = snapshot.data();
            const year = data.academicYear;

            if (/^\d{4}\/\d{4}$/.test(year || "")) {
                activeAcademicYear = year;
                renderYears(activeAcademicYear);
            }
        }

    } catch (error) {
        console.error("Gagal memuat tahun ajaran:", error);
    }
}

/* =========================================
   7. NOMOR REGISTRASI OTOMATIS
========================================= */

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

/* =========================================
   8. MENGAMBIL DATA FORMULIR
========================================= */

function getFormData() {
    const raw = Object.fromEntries(
        new FormData(form).entries()
    );

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

/* =========================================
   9. MENGIRIM PENDAFTARAN KE FIRESTORE
========================================= */

form.addEventListener("submit", async event => {
    event.preventDefault();

    setStatus(formStatus, "");

    if (!form.reportValidity()) {
        return;
    }

    if (!firebaseReady) {
        setStatus(
            formStatus,
            "Firebase belum siap. Periksa konfigurasi terlebih dahulu.",
            true
        );
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Mengirim pendaftaran...";

    try {
        // Login anonim digunakan untuk pengiriman formulir.
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }

        const user = auth.currentUser;

        if (!user) {
            throw new Error(
                "Sesi pengguna belum tersedia. Muat ulang halaman."
            );
        }

        const registrationNumber = makeRegistrationNumber();
        const data = getFormData();

        // Tidak ada unggah dokumen atau Firebase Storage.
        await addDoc(collection(db, "applications"), {
            ...data,
            registrationNumber,
            submittedByUid: user.uid,
            status: "Menunggu verifikasi",
            createdAt: serverTimestamp()
        });

        // Tampilkan nomor registrasi.
        $("#registrationNumber").textContent = registrationNumber;

        // Kosongkan formulir setelah berhasil.
        form.reset();

        renderYears(activeAcademicYear);

        // Tampilkan dialog sukses.
        $("#successDialog").showModal();

        setStatus(
            formStatus,
            "Pendaftaran berhasil dikirim. Simpan nomor registrasi."
        );

    } catch (error) {
        console.error("Gagal mengirim pendaftaran:", error);

        let message =
            "Pendaftaran gagal. Periksa koneksi internet dan konfigurasi Firebase.";

        if (
            error.code === "permission-denied" ||
            error.code === "firestore/permission-denied"
        ) {
            message =
                "Akses database ditolak. Periksa Firestore Rules.";
        } else if (error.code === "auth/operation-not-allowed") {
            message =
                "Login anonim belum diaktifkan di Firebase Authentication.";
        } else if (error.code === "auth/network-request-failed") {
            message =
                "Koneksi internet bermasalah. Silakan coba kembali.";
        } else if (error.message) {
            message = error.message;
        }

        setStatus(formStatus, message, true);

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Kirim Pendaftaran →";
    }
});

/* =========================================
   10. TOMBOL FORMULIR
========================================= */

form.addEventListener("reset", () => {
    setStatus(formStatus, "");

    setTimeout(() => {
        renderYears(activeAcademicYear);
    }, 0);
});

$("#closeSuccess").addEventListener("click", () => {
    $("#successDialog").close();
});

/* =========================================
   11. MENU NAVIGASI
========================================= */

$("#menuToggle").addEventListener("click", () => {
    $("#navigation").classList.toggle("open");
});

$("#navigation").querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        $("#navigation").classList.remove("open");
    });
});

/* =========================================
   12. MEMBUKA DASHBOARD ADMIN
========================================= */

$("#openAdmin").addEventListener("click", () => {
    $("#adminPanel").hidden = false;

    $("#adminPanel").scrollIntoView({
        behavior: "smooth"
    });
});

/* =========================================
   13. MEMERIKSA HAK AKSES ADMIN
========================================= */

async function isAdmin() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        return false;
    }

    const snapshot = await getDoc(
        doc(db, "admins", auth.currentUser.uid)
    );

    return (
        snapshot.exists() &&
        snapshot.data().active === true
    );
}

/* =========================================
   14. LOGIN ADMIN
========================================= */

$("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!firebaseReady) {
        setStatus(
            $("#adminStatus"),
            "Firebase belum dikonfigurasi.",
            true
        );
        return;
    }

    const formData = new FormData(event.currentTarget);

    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        const authorized = await isAdmin();

        if (!authorized) {
            await signOut(auth);

            throw new Error(
                "Akun ini belum memiliki izin admin."
            );
        }

        $("#adminLoginBox").hidden = true;
        $("#adminDataBox").hidden = false;

        await loadGlobalSettings();

        $("#adminAcademicYear").value = activeAcademicYear;

        await loadAdminData();

        setStatus($("#adminStatus"), "");

    } catch (error) {
        console.error("Login admin gagal:", error);

        let message = error.message || "Login admin gagal.";

        if (error.code === "auth/invalid-credential") {
            message = "Email atau kata sandi salah.";
        } else if (error.code === "auth/too-many-requests") {
            message =
                "Terlalu banyak percobaan login. Coba lagi nanti.";
        } else if (
            error.code === "permission-denied" ||
            error.code === "firestore/permission-denied"
        ) {
            message =
                "Akses ditolak. Periksa dokumen admin dan Firestore Rules.";
        }

        setStatus($("#adminStatus"), message, true);
    }
});

/* =========================================
   15. MENYIMPAN TAHUN AJARAN
========================================= */

$("#saveAcademicYear").addEventListener("click", async () => {
    const value = $("#adminAcademicYear").value.trim();

    if (!/^\d{4}\/\d{4}$/.test(value)) {
        setStatus(
            $("#adminStatus"),
            "Gunakan format tahun ajaran, misalnya 2027/2028.",
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

        activeAcademicYear = value;

        renderYears(activeAcademicYear);

        setStatus(
            $("#adminStatus"),
            `Tahun ajaran berhasil diubah menjadi ${value}.`
        );

    } catch (error) {
        console.error("Gagal menyimpan tahun ajaran:", error);

        setStatus(
            $("#adminStatus"),
            error.message || "Gagal menyimpan tahun ajaran.",
            true
        );
    }
});

/* =========================================
   16. MEMUAT DATA PENDAFTAR
========================================= */

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

/* =========================================
   17. MENAMPILKAN TABEL ADMIN
========================================= */

function renderAdminTable() {
    const search = $("#adminSearch").value
        .toLowerCase()
        .trim();

    const filtered = adminRecords.filter(row => {
        return [
            row.registrationNumber,
            row.fullName,
            row.guardianPhone,
            row.level,
            row.academicYear
        ].some(value =>
            String(value || "")
                .toLowerCase()
                .includes(search)
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

/* =========================================
   18. MUAT ULANG DATA ADMIN
========================================= */

$("#refreshAdmin").addEventListener("click", async () => {
    try {
        await loadAdminData();

        setStatus(
            $("#adminStatus"),
            "Data berhasil diperbarui."
        );

    } catch (error) {
        console.error(error);

        setStatus(
            $("#adminStatus"),
            error.message || "Gagal memuat data.",
            true
        );
    }
});

/* =========================================
   19. EKSPOR DATA KE CSV
========================================= */

$("#exportCsv").addEventListener("click", () => {
    if (!adminRecords.length) {
        setStatus(
            $("#adminStatus"),
            "Belum ada data untuk diekspor.",
            true
        );
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

    const escapeCsv = value => {
        let text = String(value ?? "");

        // Mencegah nilai teks dianggap sebagai formula spreadsheet.
        if (/^[=+\-@\t\r]/.test(text)) {
            text = "'" + text;
        }

        return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
        columns.map(escapeCsv).join(","),

        ...adminRecords.map(row =>
            columns
                .map(key => escapeCsv(row[key]))
                .join(",")
        )
    ].join("\r\n");

    const blob = new Blob(
        ["\uFEFF" + csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "data-psb-santri.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});

/* =========================================
   20. LOGOUT ADMIN
========================================= */

$("#adminSignOut").addEventListener("click", async () => {
    try {
        if (auth.currentUser) {
            await signOut(auth);
        }

        $("#adminLoginBox").hidden = false;
        $("#adminDataBox").hidden = true;

        adminRecords = [];

        $("#adminTableBody").replaceChildren();

        setStatus(
            $("#adminStatus"),
            "Berhasil keluar dari dashboard."
        );

    } catch (error) {
        console.error("Logout gagal:", error);

        setStatus(
            $("#adminStatus"),
            "Gagal keluar. Silakan coba kembali.",
            true
        );
    }
});

/* =========================================
   21. PEMERIKSAAN SESI FIREBASE
========================================= */

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

                $("#adminAcademicYear").value =
                    activeAcademicYear;

                await loadAdminData();

            } else {
                $("#adminLoginBox").hidden = false;
                $("#adminDataBox").hidden = true;
            }

        } catch (error) {
            console.error(
                "Pemeriksaan sesi admin gagal:",
                error
            );

            $("#adminLoginBox").hidden = false;
            $("#adminDataBox").hidden = true;
        }
    });
}
