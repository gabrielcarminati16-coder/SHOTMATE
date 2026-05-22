// --- 1. CONFIGURAZIONE GLOBALE ---
const auth = firebase.auth();

let myShots = [];
let myRealFriends = [];
let myProfile = { username: "Tu (ShotMate)", friendCode: "" };
let map = null;
let base64Image = "";
let globalRegioniVisitate = new Set();
let friendsListeners = {};

const italiaRegioniDatabase = {
    'abruzzo': ['aquila', 'l\'aquila', 'pescara', 'chieti', 'teramo', 'sulmona', 'vasto', 'montesilvano'],
    'basilicata': ['potenza', 'matera', 'melfi', 'pisticci'],
    'calabria': ['catanzaro', 'reggio calabria', 'cosenza', 'lamezia terme', 'crotone', 'vibo valentia'],
    'campania': ['napoli', 'salerno', 'caserta', 'benevento', 'avellino', 'sorrento', 'amalfi', 'pompei', 'pozzuoli'],
    'emilia-romagna': ['bologna', 'modena', 'reggio emilia', 'parma', 'piacenza', 'ferrara', 'ravenna', 'forlì', 'cesena', 'rimini', 'riccione'],
    'friuli-venezia giulia': ['trieste', 'udine', 'pordenone', 'gorizia', 'lignano'],
    'lazio': ['roma', 'latina', 'viterbo', 'rieti', 'frosinone', 'tivoli', 'ostia', 'fiumicino'],
    'liguria': ['genova', 'la spezia', 'savona', 'imperia', 'sanremo', 'ventimiglia', 'portofino', 'rapallo'],
    'lombardia': ['milano', 'brescia', 'bergamo', 'monza', 'como', 'varese', 'pavia', 'cremona', 'mantova', 'lecco', 'lodi', 'sondrio', 'busto arsizio'],
    'marche': ['ancona', 'pesaro', 'fano', 'ascoli piceno', 'macerata', 'fermo', 'civitanova'],
    'molise': ['campobasso', 'isernia', 'termoli'],
    'piemonte': ['torino', 'novara', 'alessandria', 'asti', 'cuneo', 'vercelli', 'biella', 'verbania', 'moncalieri'],
    'puglia': ['bari', 'taranto', 'foggia', 'lecce', 'andria', 'barletta', 'trani', 'brindisi', 'gallipoli', 'otranto'],
    'sardegna': ['cagliari', 'sassari', 'quartu', 'olbia', 'alghero', 'nuoro', 'oristano', 'carbonia'],
    'sicilia': ['palermo', 'catania', 'messina', 'siracusa', 'ragusa', 'trapani', 'agrigento', 'caltanissetta', 'enna', 'taormina', 'cefàlu', 'marzamemi'],
    'toscana': ['firenze', 'pisa', 'livorno', 'arezzo', 'pistoia', 'lucca', 'grosseto', 'siena', 'massa', 'carrara', 'viareggio', 'elba'],
    'trentino-alto adige': ['trento', 'bolzano', 'merano', 'rovereto'],
    'umbria': ['perugia', 'terni', 'assisi', 'foligno', 'orvieto', 'spoleto'],
    'valle d\'aosta': ['aosta', 'courmayeur', 'cervinia'],
    'veneto': ['venezia', 'verona', 'padova', 'vicenza', 'treviso', 'rovigo', 'belluno', 'chioggia', 'jesolo', 'cortina']
};

// --- 2. AUTENTICAZIONE ---
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.replace('./login.html');
    } else {
        setupRealtimeSync(user.uid);
    }
});

function generateFriendCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "SM-";
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function setupRealtimeSync(uid) {
    // Profilo personale
    db.collection("users").doc(uid).onSnapshot((doc) => {
        if (doc.exists) {
            myProfile = doc.data();
            if (!myProfile.friendCode) {
                myProfile.friendCode = generateFriendCode();
                db.collection("users").doc(uid).update({ friendCode: myProfile.friendCode });
            }
        } else {
            myProfile = { username: "Tu (ShotMate)", friendCode: generateFriendCode() };
            db.collection("users").doc(uid).set(myProfile);
        }
        const display = document.getElementById('myFriendCodeDisplay');
        if (display) display.innerText = myProfile.friendCode;
    }, err => console.error("Errore profilo:", err));

    // Bicchierini personali
    db.collection("users").doc(uid).collection("shots").onSnapshot((snapshot) => {
        myShots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderShots();
        updateStats();
        if (document.getElementById('page-map').classList.contains('active-page')) {
            initOrRefreshMap();
        }
        renderLeaderboard();
    }, err => console.error("Errore bicchierini:", err));

    // Lista amici
    db.collection("users").doc(uid).collection("realFriends").onSnapshot((snapshot) => {
        myRealFriends = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        myRealFriends.forEach(friend => {
            if (!friendsListeners[friend.uid]) {
                // Ascolta profilo amico
                db.collection("users").doc(friend.uid).onSnapshot(friendDoc => {
                    if (friendDoc.exists) {
                        friend.name = friendDoc.data().username || friend.name;
                        renderLeaderboard();
                    }
                });

                // Ascolta shots amico
                friendsListeners[friend.uid] = db.collection("users").doc(friend.uid).collection("shots")
                    .onSnapshot(shotsSnap => {
                        const friendShotsList = shotsSnap.docs.map(d => d.data());
                        friend.shotsCount = friendShotsList.length;
                        if (friendShotsList.length > 0) {
                            const validShots = friendShotsList.filter(s => s.date).sort((a, b) => b.date.localeCompare(a.date));
                            friend.lastCity = validShots.length > 0
                                ? (validShots[0].city || "Qualche parte")
                                : (friendShotsList[0].city || "Qualche parte");
                        } else {
                            friend.lastCity = "Nessuno";
                        }
                        renderLeaderboard();
                    });
            }
        });
        renderLeaderboard();
    }, err => console.error("Errore amici:", err));
}

// --- 3. NAVIGAZIONE ---
const navItems = document.querySelectorAll('.bottom-nav .nav-item');
const appPages = document.querySelectorAll('.app-page');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const targetPage = item.getAttribute('data-page');
        appPages.forEach(page => {
            page.classList.remove('active-page');
            if (page.id === targetPage) page.classList.add('active-page');
        });
        if (targetPage === 'page-map') initOrRefreshMap();
        if (targetPage === 'page-stats') updateStats();
        if (targetPage === 'page-amici') renderLeaderboard();
    });
});

// --- 4. MODAL PROFILO ---
const profileModal = document.getElementById('profileModal');
const btnOpenProfileModal = document.getElementById('btnOpenProfileModal');
const btnSaveProfile = document.getElementById('btnSaveProfile');
const btnLogout = document.getElementById('btnLogout');
const profileUsernameInput = document.getElementById('profileUsername');
const myFriendCodeDisplay = document.getElementById('myFriendCodeDisplay');

if (btnOpenProfileModal) {
    btnOpenProfileModal.addEventListener('click', () => {
        profileUsernameInput.value = myProfile.username || "";
        myFriendCodeDisplay.innerText = myProfile.friendCode || "######";
        profileModal.classList.add('open');
    });
}

const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
if (btnCloseProfileModal) {
    btnCloseProfileModal.addEventListener('click', () => profileModal.classList.remove('open'));
}

if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
        const newName = profileUsernameInput.value.trim();
        if (newName !== "") {
            myProfile.username = newName;
            const user = auth.currentUser;
            if (user) await db.collection("users").doc(user.uid).update({ username: newName });
        }
        profileModal.classList.remove('open');
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        if (confirm("Sei sicuro di voler uscire da ShotMate?")) {
            try {
                Object.values(friendsListeners).forEach(unsub => unsub());
                friendsListeners = {};
                await auth.signOut();
            } catch (err) {
                alert("Errore durante il logout: " + err.message);
            }
        }
    });
}

// --- 5. SHOTS (INSERIMENTO / MODIFICA) ---
const shotModal = document.getElementById('shotModal');
const btnOpenModal = document.getElementById('btnOpenModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnSaveShot = document.getElementById('btnSaveShot');
const gridShots = document.getElementById('gridShots');
const shotIdInput = document.getElementById('shotId');
const shotImageInput = document.getElementById('shotImage');
const imageUploadBox = document.getElementById('imageUploadBox');
const shotCityInput = document.getElementById('shotCity');
const shotCountryInput = document.getElementById('shotCountry');
const shotDateInput = document.getElementById('shotDate');
const shotNotesInput = document.getElementById('shotNotes');

if (imageUploadBox) {
    imageUploadBox.addEventListener('click', () => shotImageInput.click());
}

if (shotImageInput) {
    shotImageInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
                    // Ridimensiona mantenendo le proporzioni (max 1000px sul lato lungo)
                    const maxSize = 1000;
                    let w = img.width;
                    let h = img.height;
                    if (w > maxSize || h > maxSize) {
                        if (w >= h) { h = Math.round(h * maxSize / w); w = maxSize; }
                        else { w = Math.round(w * maxSize / h); h = maxSize; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    base64Image = canvas.toDataURL('image/jpeg', 0.7);
                    // Anteprima con object-fit: contain (foto intera visibile)
                    imageUploadBox.innerHTML = `<img src="${base64Image}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; background:#000b1d;">`;
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- RICERCA E ORDINAMENTO ---
let currentSearch = "";
let currentSort = "newest";

function getFilteredAndSortedShots() {
    let shots = [...myShots];

    // Filtra per ricerca
    if (currentSearch.trim() !== "") {
        const q = currentSearch.toLowerCase().trim();
        shots = shots.filter(s =>
            (s.city || "").toLowerCase().includes(q) ||
            (s.country || "").toLowerCase().includes(q) ||
            (s.notes || "").toLowerCase().includes(q)
        );
    }

    // Ordina
    if (currentSort === "newest") {
        shots.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    } else if (currentSort === "oldest") {
        shots.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    } else if (currentSort === "city") {
        shots.sort((a, b) => (a.city || "").localeCompare(b.city || ""));
    }

    return shots;
}

function renderShots() {
    if (!gridShots) return;
    gridShots.innerHTML = "";

    const badge = document.getElementById('shotsBadgeCount');
    if (badge) badge.textContent = myShots.length;

    const noResults = document.getElementById('noResultsMsg');
    const shots = getFilteredAndSortedShots();

    if (myShots.length === 0) {
        gridShots.innerHTML = `<p style="grid-column: span 2; text-align: center; color: #8a99ad; padding: 40px 20px;">La tua collezione è vuota.<br>Aggiungi il tuo primo bicchierino!</p>`;
        if (noResults) noResults.style.display = "none";
        return;
    }

    if (shots.length === 0) {
        if (noResults) noResults.style.display = "block";
        return;
    }

    if (noResults) noResults.style.display = "none";

    shots.forEach((shot) => {
        const card = document.createElement('div');
        card.className = 'shot-card';
        const imgHtml = shot.image
            ? `<img src="${shot.image}">`
            : `<span class="material-icons" style="color:#0077ff">local_bar</span>`;
        card.innerHTML = `
            <div class="shot-img-container">${imgHtml}</div>
            <h4>${shot.city || "Qualche parte"}</h4>
            <p class="geo">${shot.country || "Mondo"}</p>
            ${shot.date ? `<p class="date">${formatDate(shot.date)}</p>` : ''}
            ${shot.notes ? `<p class="notes">${shot.notes}</p>` : ''}
            <div class="shot-actions">
                <button class="btn-icon" onclick="editShot('${shot.id}')"><span class="material-icons" style="font-size:18px;color:#8a99ad;">edit</span></button>
                <button class="btn-icon" onclick="deleteShot('${shot.id}')"><span class="material-icons" style="font-size:18px;color:#e74c3c;">delete</span></button>
            </div>
        `;
        gridShots.appendChild(card);
    });
}

// Setup barra ricerca e ordinamento
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const sortBtns = document.querySelectorAll('.sort-btn');

if (searchInput) {
    searchInput.addEventListener('input', () => {
        currentSearch = searchInput.value;
        if (clearSearchBtn) clearSearchBtn.style.display = currentSearch ? 'flex' : 'none';
        renderShots();
    });
}
if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = "";
        currentSearch = "";
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        renderShots();
    });
}
sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        sortBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.getAttribute('data-sort');
        renderShots();
    });
});

function formatDate(d) {
    if (!d || !d.includes("-")) return d;
    const p = d.split("-");
    return `${p[2]}/${p[1]}/${p[0]}`;
}

if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = "Nuovo Bicchierino";
        shotIdInput.value = "";
        shotCityInput.value = "";
        shotCountryInput.value = "";
        shotDateInput.value = "";
        shotNotesInput.value = "";
        shotImageInput.value = "";
        imageUploadBox.innerHTML = `<span class="material-icons upload-icon">add_a_photo</span><span class="upload-text">AGGIUNGI IMMAGINE</span>`;
        base64Image = "";
        shotModal.classList.add('open');
    });
}

if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => shotModal.classList.remove('open'));
}

if (btnSaveShot) {
    btnSaveShot.addEventListener('click', async () => {
        const id = shotIdInput.value;
        const city = shotCityInput.value.trim();
        const country = shotCountryInput.value.trim();
        const date = shotDateInput.value;
        const notes = shotNotesInput.value.trim();
        const user = auth.currentUser;
        if (!user) return;

        const shotPayload = { city, country, date, notes, image: base64Image };

        if (id) {
            if (!base64Image) {
                const oldShot = myShots.find(s => s.id === id);
                if (oldShot) shotPayload.image = oldShot.image;
            }
            await db.collection("users").doc(user.uid).collection("shots").doc(id).set(shotPayload, { merge: true });
        } else {
            await db.collection("users").doc(user.uid).collection("shots").add(shotPayload);
        }
        shotModal.classList.remove('open');
    });
}

window.editShot = function (id) {
    const shot = myShots.find(s => s.id === id);
    if (shot) {
        document.getElementById('modalTitle').innerText = "Modifica Bicchierino";
        shotIdInput.value = shot.id;
        shotCityInput.value = shot.city || "";
        shotCountryInput.value = shot.country || "";
        shotDateInput.value = shot.date || "";
        shotNotesInput.value = shot.notes || "";
        base64Image = shot.image || "";
        imageUploadBox.innerHTML = shot.image
            ? `<img src="${shot.image}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; background:#000b1d;">`
            : `<span class="material-icons upload-icon">add_a_photo</span>`;
        shotModal.classList.add('open');
    }
};

window.deleteShot = async function (id) {
    const user = auth.currentUser;
    if (user && confirm("Vuoi eliminare questo bicchierino?")) {
        await db.collection("users").doc(user.uid).collection("shots").doc(id).delete();
    }
};

// --- 6. STATISTICHE E REGIONI ---
const regionsModal = document.getElementById('regionsModal');
const cardRegionsBtn = document.getElementById('cardRegionsBtn');
const btnCloseRegionsModal = document.getElementById('btnCloseRegionsModal');
const regionsListContainer = document.getElementById('regionsListContainer');

function updateStats() {
    const totalShots = myShots.length;
    const totalDisplay = document.getElementById('stat-total');
    if (totalDisplay) totalDisplay.innerText = totalShots;

    const cities = [...new Set(myShots.map(s => (s.city || "").toLowerCase().trim()).filter(c => c !== ""))];
    const countries = [...new Set(myShots.map(s => (s.country || "").toLowerCase().trim()).filter(c => c !== ""))];

    const citiesDisplay = document.getElementById('stat-cities');
    const countriesDisplay = document.getElementById('stat-countries');
    if (citiesDisplay) citiesDisplay.innerText = cities.length;
    if (countriesDisplay) countriesDisplay.innerText = countries.length;

    globalRegioniVisitate.clear();
    myShots.forEach(shot => {
        if (shot.city && (shot.country && shot.country.toLowerCase().trim() === 'italia' || !shot.country)) {
            const cityLower = shot.city.toLowerCase().trim();
            for (const [regione, cittaList] of Object.entries(italiaRegioniDatabase)) {
                if (cittaList.includes(cityLower) || cityLower === regione) {
                    globalRegioniVisitate.add(regione);
                    break;
                }
            }
        }
    });

    const regionsDisplay = document.getElementById('stat-regions');
    if (regionsDisplay) regionsDisplay.innerText = `${globalRegioniVisitate.size}/20`;

    const badgeMedal = document.getElementById('badgeMedal');
    const badgeRankName = document.getElementById('badgeRankName');
    const badgeNextRank = document.getElementById('badgeNextRank');

if (badgeMedal && badgeRankName && badgeNextRank) {
        if (totalShots >= 121) {
            badgeMedal.innerText = "🥇"; badgeRankName.innerText = "Medaglia d'Oro"; badgeNextRank.innerText = "Sei il Re indiscusso dei banconi! 👑";
        } else if (totalShots >= 81) {
            badgeMedal.innerText = "🥈"; badgeRankName.innerText = "Medaglia d'Argento"; badgeNextRank.innerText = `Mancano ${121 - totalShots} bicchierini all'Oro.`;
        } else if (totalShots >= 41) {
            badgeMedal.innerText = "🥉"; badgeRankName.innerText = "Medaglia di Bronzo"; badgeNextRank.innerText = `Mancano ${81 - totalShots} bicchierini all'Argento.`;
        } else {
            badgeMedal.innerText = "🪵"; badgeRankName.innerText = "Medaglia di Legno"; badgeNextRank.innerText = `Mancano ${41 - totalShots} bicchierini al Bronzo.`;
        }
    }
}

if (cardRegionsBtn) {
    cardRegionsBtn.addEventListener('click', () => {
        if (!regionsListContainer) return;
        regionsListContainer.innerHTML = "";
        Object.keys(italiaRegioniDatabase).sort().forEach(regione => {
            const itemRow = document.createElement('div');
            const isVisitata = globalRegioniVisitate.has(regione);
            itemRow.className = `region-row-item ${isVisitata ? 'visited' : 'not-visited'}`;
            itemRow.innerHTML = `
                <span class="region-name" style="text-transform: capitalize;">${regione}</span>
                <span class="material-icons" style="color: ${isVisitata ? '#f1c40f' : '#2c3e50'}; font-size: 20px;">${isVisitata ? 'check_circle' : 'radio_button_unchecked'}</span>
            `;
            regionsListContainer.appendChild(itemRow);
        });
        regionsModal.classList.add('open');
    });
}

if (btnCloseRegionsModal) {
    btnCloseRegionsModal.addEventListener('click', () => regionsModal.classList.remove('open'));
}

// --- 7. CLASSIFICA AMICI ---
const friendModal = document.getElementById('friendModal');
const btnOpenFriendModal = document.getElementById('btnOpenFriendModal');
const btnCloseFriendModal = document.getElementById('btnCloseFriendModal');
const btnSaveFriend = document.getElementById('btnSaveFriend');
const friendsLeaderboard = document.getElementById('friendsLeaderboard');
const friendFriendCodeInput = document.getElementById('friendFriendCode');

function getBadgeEmoji(count) {
    if (count >= 121) return "🥇";
    if (count >= 81) return "🥈";
    if (count >= 41) return "🥉";
    return "🪵";
}

function renderLeaderboard() {
    if (!friendsLeaderboard) return;
    friendsLeaderboard.innerHTML = "";

    const userProfile = {
        uid: "me",
        name: myProfile.username || "Tu (ShotMate)",
        shotsCount: myShots.length,
        lastCity: myShots.length > 0
            ? (myShots.filter(s => s.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.city || myShots[0].city || "Nessuna")
            : "Nessuna",
        isMe: true,
        code: myProfile.friendCode
    };

    let fullList = [...myRealFriends, userProfile];
    fullList.sort((a, b) => (b.shotsCount || 0) - (a.shotsCount || 0));

    fullList.forEach((member, index) => {
        const position = index + 1;
        let rankClass = "rank-number";
        let rankDisplay = position;
        if (position === 1) { rankDisplay = "👑"; rankClass += " rank-1"; }
        if (position === 2) rankClass += " rank-2";
        if (position === 3) rankClass += " rank-3";

        const cardItem = document.createElement('div');
        cardItem.className = `friend-item ${member.isMe ? 'is-me' : ''} ${!member.isMe ? 'friend-tappable' : ''}`;
        cardItem.innerHTML = `
            <div class="${rankClass}">${rankDisplay}</div>
            <span class="material-icons friend-avatar">account_circle</span>
            <div class="friend-info">
                <h4>${member.name} ${member.isMe ? '(Tu)' : ''}</h4>
                <p>${member.shotsCount || 0} Bicchierini • Ultimo: ${member.lastCity || 'In attesa...'}</p>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <div class="friend-badge-display">${getBadgeEmoji(member.shotsCount || 0)}</div>
                ${!member.isMe ? '<span class="material-icons" style="font-size:16px; color:#5d6d7e;">chevron_right</span>' : ''}
            </div>
        `;
        if (!member.isMe) {
            cardItem.addEventListener('click', () => openFriendCollection(member));
        }
        friendsLeaderboard.appendChild(cardItem);
    });
}

if (btnOpenFriendModal) {
    btnOpenFriendModal.addEventListener('click', () => {
        friendFriendCodeInput.value = "";
        friendModal.classList.add('open');
    });
}
if (btnCloseFriendModal) {
    btnCloseFriendModal.addEventListener('click', () => friendModal.classList.remove('open'));
}

if (btnSaveFriend) {
    btnSaveFriend.addEventListener('click', async () => {
        const code = friendFriendCodeInput.value.trim().toUpperCase();
        const user = auth.currentUser;

        if (!user) return;
        if (code === "") { alert("Inserisci il Codice Amico!"); return; }
        if (code === myProfile.friendCode) { alert("Non puoi aggiungere il tuo stesso codice amico!"); return; }

        try {
            const querySnapshot = await db.collection("users").where("friendCode", "==", code).get();

            if (querySnapshot.empty) {
                alert("Nessun utente trovato con questo Codice Amico. Controlla che sia corretto!");
                return;
            }

            const friendDoc = querySnapshot.docs[0];
            const friendUid = friendDoc.id;
            const friendData = friendDoc.data();

            const alreadyAdded = myRealFriends.some(f => f.code === code);
            if (alreadyAdded) {
                alert("Hai già aggiunto questo amico!");
                friendModal.classList.remove('open');
                return;
            }

            await db.collection("users").doc(user.uid).collection("realFriends").doc(friendUid).set({
                uid: friendUid,
                name: friendData.username || "Amico",
                code: code
            });

            alert(`${friendData.username || "Amico"} aggiunto con successo alla tua classifica!`);
            friendModal.classList.remove('open');

        } catch (err) {
            console.error("Errore durante l'aggiunta dell'amico:", err);
            alert("Errore nella ricerca: " + err.message);
        }
    });
}

// --- 8. MAPPA (LEAFLET) ---
function initOrRefreshMap() {
    if (!map) {
        map = L.map('map').setView([42.0, 12.5], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    }
    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
    map.eachLayer((layer) => { if (layer instanceof L.Marker) map.removeLayer(layer); });

    myShots.forEach(shot => {
        if (shot.city) {
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(shot.city + ',' + (shot.country || ''))}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.length > 0) {
                        const lat = data[0].lat;
                        const lon = data[0].lon;
                        const goldDotIcon = L.divIcon({
                            className: 'gold-dot-marker',
                            html: '<div style="width:10px; height:10px; background-color:#f1c40f; border:1.5px solid #00112c; border-radius:50%; box-shadow:0 0 8px rgba(241,196,15,0.7);"></div>',
                            iconSize: [10, 10],
                            iconAnchor: [5, 5],
                        });
                        const shotImgPreview = shot.image
                            ? `<div style="width:100%; height:90px; background-color:#000b1d; border-radius:6px; margin-bottom:6px; display:flex; align-items:center; justify-content:center; overflow:hidden;"><img src="${shot.image}" style="width:100%; height:100%; object-fit:contain;"></div>`
                            : '';
                        L.marker([lat, lon], { icon: goldDotIcon }).addTo(map)
                            .bindPopup(`
                                <div style="text-align:center; font-family:sans-serif;">
                                    ${shotImgPreview}
                                    <b style="color:#ffffff; font-size:13px; text-transform:uppercase; display:block; margin-bottom:1px;">${shot.city}</b>
                                    <span style="color:#8a99ad; font-size:11px; display:block; margin-bottom:8px;">${shot.country || ''}</span>
                                    <button onclick="editShotFromMap('${shot.id}')" style="background:#0077ff; color:white; border:none; padding:5px 10px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; width:100%;">Modifica</button>
                                </div>
                            `, { minWidth: 120, maxWidth: 140, closeButton: false });
                    }
                })
                .catch(err => console.error("Errore Geocoding:", err));
        }
    });
}

window.editShotFromMap = function (id) {
    if (map) map.closePopup();
    navItems.forEach(nav => nav.classList.remove('active'));
    const homeNav = document.querySelector('.bottom-nav .nav-item[data-page="page-home"]');
    if (homeNav) homeNav.classList.add('active');
    appPages.forEach(page => {
        page.classList.remove('active-page');
        if (page.id === 'page-home') page.classList.add('active-page');
    });
    window.editShot(id);
};

// --- 9. COLLEZIONE AMICO ---
let friendCollectionShots = [];
let friendCollectionSearch = "";

const friendCollectionModal = document.getElementById('friendCollectionModal');
const btnCloseFriendCollection = document.getElementById('btnCloseFriendCollection');
const friendCollectionGrid = document.getElementById('friendCollectionGrid');
const friendCollectionSearchInput = document.getElementById('friendCollectionSearch');
const clearFriendSearchBtn = document.getElementById('clearFriendSearch');

function openFriendCollection(member) {
    // Reset UI
    friendCollectionSearch = "";
    if (friendCollectionSearchInput) { friendCollectionSearchInput.value = ""; }
    if (clearFriendSearchBtn) clearFriendSearchBtn.style.display = "none";

    const nameEl = document.getElementById('friendCollectionName');
    const countEl = document.getElementById('friendCollectionCount');
    if (nameEl) nameEl.innerText = `Collezione di ${member.name}`;

    friendCollectionShots = [];
    if (friendCollectionGrid) friendCollectionGrid.innerHTML = `<p style="grid-column:span 2; text-align:center; color:#8a99ad; padding:30px 0;">Caricamento...</p>`;
    if (friendCollectionModal) friendCollectionModal.classList.add('open');

    // Carica shots dell'amico in tempo reale
    db.collection("users").doc(member.uid).collection("shots").get().then(snapshot => {
        friendCollectionShots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        friendCollectionShots.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        if (countEl) countEl.innerText = `${friendCollectionShots.length} bicchierini`;
        renderFriendCollection();
    }).catch(err => {
        if (friendCollectionGrid) friendCollectionGrid.innerHTML = `<p style="grid-column:span 2; text-align:center; color:#e74c3c; padding:30px 0;">Errore nel caricamento.</p>`;
        console.error("Errore carica collezione amico:", err);
    });
}

function renderFriendCollection() {
    if (!friendCollectionGrid) return;
    friendCollectionGrid.innerHTML = "";

    const emptyMsg = document.getElementById('friendCollectionEmpty');
    const q = friendCollectionSearch.toLowerCase().trim();

    let shots = friendCollectionShots;
    if (q !== "") {
        shots = shots.filter(s =>
            (s.city || "").toLowerCase().includes(q) ||
            (s.country || "").toLowerCase().includes(q) ||
            (s.notes || "").toLowerCase().includes(q)
        );
    }

    if (friendCollectionShots.length === 0) {
        friendCollectionGrid.innerHTML = `<p style="grid-column:span 2; text-align:center; color:#8a99ad; padding:30px 0;">Questo amico non ha ancora bicchierini! 🥃</p>`;
        if (emptyMsg) emptyMsg.style.display = "none";
        return;
    }
    if (shots.length === 0) {
        if (emptyMsg) emptyMsg.style.display = "block";
        return;
    }
    if (emptyMsg) emptyMsg.style.display = "none";

    shots.forEach(shot => {
        const card = document.createElement('div');
        card.className = 'shot-card';
        const imgHtml = shot.image
            ? `<img src="${shot.image}">`
            : `<span class="material-icons" style="color:#0077ff">local_bar</span>`;
        card.innerHTML = `
            <div class="shot-img-container">${imgHtml}</div>
            <h4>${shot.city || "Qualche parte"}</h4>
            <p class="geo">${shot.country || "Mondo"}</p>
            ${shot.date ? `<p class="date">${formatDate(shot.date)}</p>` : ''}
            ${shot.notes ? `<p class="notes">${shot.notes}</p>` : ''}
        `;
        friendCollectionGrid.appendChild(card);
    });
}

if (btnCloseFriendCollection) {
    btnCloseFriendCollection.addEventListener('click', () => {
        friendCollectionModal.classList.remove('open');
    });
}

if (friendCollectionSearchInput) {
    friendCollectionSearchInput.addEventListener('input', () => {
        friendCollectionSearch = friendCollectionSearchInput.value;
        if (clearFriendSearchBtn) clearFriendSearchBtn.style.display = friendCollectionSearch ? 'flex' : 'none';
        renderFriendCollection();
    });
}

if (clearFriendSearchBtn) {
    clearFriendSearchBtn.addEventListener('click', () => {
        friendCollectionSearchInput.value = "";
        friendCollectionSearch = "";
        clearFriendSearchBtn.style.display = 'none';
        friendCollectionSearchInput.focus();
        renderFriendCollection();
    });
}
