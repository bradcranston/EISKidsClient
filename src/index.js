// Dev test data (bundled by Parcel; used only when FileMaker is not present)
const DEV_CLIENT_DATA = require('../client.json');
const DEV_USERS_DATA = require('../users.json');

// Global state
let currentChild = null;
let currentAccount = null;
let children = [];
let sessionNotes = [];
let currentReminders = [];
let currentGoals = [];
let currentFamilyMembers = [];
let currentClientUsers = [];
let currentUserList = [];
let allAccounts = [];
let previousPage = null;
// Record-level back navigation
let previousAccount = null;       // last account viewed before current one
let previousChildData = null;     // raw data of last client viewed before current one
let lastRenderedChildRawData = null; // raw data from most recent renderInterface call
let suppressHistoryOnce = false;  // prevents switchPage from recording history on restore

function splitNameParts(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  const firstName = parts.shift() || '';
  return { firstName, lastName: parts.join(' ') };
}

function getServiceCoordinatorValues() {
  const firstName = document.getElementById('serviceCoordinatorFirstName').value.trim();
  const lastName = document.getElementById('serviceCoordinatorLastName').value.trim();
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ').trim()
  };
}

function setServiceCoordinatorValues(firstName, lastName, fallbackFullName = '') {
  let safeFirstName = (firstName || '').trim();
  let safeLastName = (lastName || '').trim();
  if (!safeFirstName && !safeLastName && fallbackFullName) {
    const parsed = splitNameParts(fallbackFullName);
    safeFirstName = parsed.firstName;
    safeLastName = parsed.lastName;
  }
  document.getElementById('serviceCoordinatorFirstName').value = safeFirstName;
  document.getElementById('serviceCoordinatorLastName').value = safeLastName;
}

function getStoredServiceCoordinatorValues(child) {
  const combined = (child?.serviceCoordinator || '').trim();
  let firstName = (child?.serviceCoordinatorFirstName || '').trim();
  let lastName = (child?.serviceCoordinatorLastName || '').trim();
  if (!firstName && !lastName && combined) {
    const parsed = splitNameParts(combined);
    firstName = parsed.firstName;
    lastName = parsed.lastName;
  }
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ').trim() || combined
  };
}

function formatDisplayDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Keep already-formatted dates unchanged.
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    return raw;
  }

  // Handle ISO date and ISO datetime without timezone shifting.
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}/${day}/${year}`;
  }

  // Fall back to Date parsing for uncommon formats.
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${month}/${day}/${year}`;
  }

  // If it cannot be parsed, return the original value.
  return raw;
}

// Page switching
function switchPage(page, { skipReload = false } = {}) {
  const clientsPage = document.getElementById('clientsPage');
  const accountsPage = document.getElementById('accountsPage');
  const dashboardPage = document.getElementById('dashboardPage');

  // Hide loading screen on first navigation — this prevents the blank initial
  // clients page from being recorded as a history entry.
  const loadingScreen = document.getElementById('loadingScreen');
  const isFirstLoad = loadingScreen && loadingScreen.style.display !== 'none';
  if (isFirstLoad) {
    loadingScreen.style.display = 'none';
  } else if (suppressHistoryOnce) {
    suppressHistoryOnce = false; // consume the flag, skip recording
  } else {
    // Track history for back navigation.
    // Only record 'clients' as the active page when a record is actually open;
    // blank Client Management is not a meaningful destination to go back to.
    const mainContent = document.getElementById('mainContent');
    const clientRecordVisible = mainContent && mainContent.style.display !== 'none';
    const activePage = dashboardPage.style.display !== 'none' ? 'dashboard'
      : accountsPage.style.display !== 'none' ? 'accounts'
      : clientRecordVisible ? 'clients'
      : null; // blank clients page — not worth tracking
    if (activePage && activePage !== page) previousPage = activePage;
  }

  // Show/hide header back button.
  // On the clients page: show only when a record is open.
  // On other pages: show only when there is a real page to go back to.
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    const mainContent = document.getElementById('mainContent');
    const clientRecordOpen = page === 'clients' && mainContent && mainContent.style.display !== 'none';
    const hasHistory = previousPage !== null;
    backBtn.style.display = (clientRecordOpen || (page !== 'clients' && hasHistory)) ? '' : 'none';
  }

  document.querySelectorAll('.hamburger-menu-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  const headerTitle = document.querySelector('.header-content h1');
  const headerSubtitle = document.querySelector('.header-subtitle');

  if (page === 'dashboard') {
    dashboardPage.style.display = '';
    clientsPage.style.display = 'none';
    accountsPage.style.display = 'none';
    if (headerTitle) headerTitle.textContent = 'Client Dashboard';
    if (headerSubtitle) headerSubtitle.textContent = 'Recent session activity';
    document.getElementById('clearBtn').textContent = 'New Client';
    document.getElementById('clearBtn').onclick = null;
    document.getElementById('clearBtn').addEventListener('click', handleClear);
    document.getElementById('saveBtn').onclick = handleSave;
    document.getElementById('cancelBtn').onclick = handleCancelClient;
  } else if (page === 'clients') {
    dashboardPage.style.display = 'none';
    clientsPage.style.display = '';
    accountsPage.style.display = 'none';
    if (headerTitle) headerTitle.textContent = 'Client Management';
    if (headerSubtitle) headerSubtitle.textContent = 'Manage clients and session notes';
    document.getElementById('clearBtn').innerHTML = `<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> New Client`;
    document.getElementById('clearBtn').onclick = null;
    document.getElementById('clearBtn').addEventListener('click', handleClear);
    document.getElementById('saveBtn').onclick = handleSave;
    document.getElementById('cancelBtn').onclick = handleCancelClient;
  } else if (page === 'accounts') {
    dashboardPage.style.display = 'none';
    clientsPage.style.display = 'none';
    accountsPage.style.display = '';
    if (headerTitle) headerTitle.textContent = 'User Accounts';
    if (headerSubtitle) headerSubtitle.textContent = 'Manage user accounts and roles';
    document.getElementById('clearBtn').innerHTML = `<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> New User`;
    document.getElementById('clearBtn').onclick = null;
    document.getElementById('clearBtn').addEventListener('click', handleNewAccount);
    document.getElementById('saveBtn').onclick = handleAccountSave;
    document.getElementById('cancelBtn').onclick = handleCancelAccount;
    if (!skipReload) loadAccounts();
  }
}

// Modal functions
function showModal(message) {
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  modalMessage.textContent = message;
  modal.style.display = 'flex';
}

function hideModal() {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
}

// Initialize the interface
function initInterface() {
  // Get DOM elements
  const openSearchBtn = document.getElementById('openSearchBtn');
  const searchModal = document.getElementById('searchModal');
  const searchModalClose = document.querySelector('.search-modal-close');
  const searchFirstName = document.getElementById('searchFirstName');
  const searchLastName = document.getElementById('searchLastName');
  const searchBtn = document.getElementById('searchBtn');
  const searchResults = document.getElementById('searchResults');
  const firstName = document.getElementById('firstName');
  const lastName = document.getElementById('lastName');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const sessionNotesList = document.getElementById('sessionNotesList');
  const modalClose = document.querySelector('.modal-close');
  const modalOkBtn = document.getElementById('modalOkBtn');

  // Export modal event listeners
  const exportBtn = document.getElementById('exportBtn');
  const exportModal = document.getElementById('exportModal');
  const exportModalClose = document.querySelector('.export-modal-close');
  const exportCancelBtn = document.getElementById('exportCancelBtn');
  const exportSubmitBtn = document.getElementById('exportSubmitBtn');

  const updateExportDateVisibility = () => {
    const exportTypeEl = document.querySelector('input[name="exportType"]:checked');
    const exportType = exportTypeEl ? exportTypeEl.value : 'sessionNotes';
    const dateGroup = document.querySelector('.export-date-group');
    if (dateGroup) {
      dateGroup.style.display = exportType === 'payroll' ? 'grid' : 'none';
    }
  };

  exportBtn.addEventListener('click', () => {
    exportModal.style.display = 'flex';
    updateExportDateVisibility();
  });

  document.querySelectorAll('input[name="exportType"]').forEach(radio => {
    radio.addEventListener('change', updateExportDateVisibility);
  });

  const closeExportModal = () => {
    exportModal.style.display = 'none';
  };

  exportModalClose.addEventListener('click', closeExportModal);
  exportCancelBtn.addEventListener('click', closeExportModal);
  exportModal.addEventListener('click', (e) => {
    if (e.target.id === 'exportModal') closeExportModal();
  });

  exportSubmitBtn.addEventListener('click', handleExport);

  // Search modal event listeners
  openSearchBtn.addEventListener('click', () => {
    searchModal.style.display = 'flex';
    searchFirstName.focus();
  });
  searchModalClose.addEventListener('click', () => {
    searchModal.style.display = 'none';
  });
  searchModal.addEventListener('click', (e) => {
    if (e.target.id === 'searchModal') {
      searchModal.style.display = 'none';
    }
  });

  // Modal event listeners
  modalClose.addEventListener('click', hideModal);
  modalOkBtn.addEventListener('click', hideModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') hideModal();
  });

  // Event listeners
  searchBtn.addEventListener('click', handleSearch);
  searchFirstName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  searchLastName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  saveBtn.onclick = handleSave;
  document.getElementById('cancelBtn').onclick = handleCancelClient;
  clearBtn.addEventListener('click', handleClear);
  document.getElementById('deleteClientBtn').addEventListener('click', handleDeleteClient);
  document.getElementById('clientUsersList').addEventListener('click', (e) => {
    const btn = e.target.closest('.cu-add-note-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.cuIndex);
    if (currentClientUsers[idx] !== undefined) handleAddNote(currentClientUsers[idx]);
  });

  // Track changes in form fields
  firstName.addEventListener('input', checkForChanges);
  lastName.addEventListener('input', checkForChanges);
  document.getElementById('clientId').addEventListener('input', checkForChanges);
  document.getElementById('county').addEventListener('input', checkForChanges);
  document.getElementById('serviceCoordinatorFirstName').addEventListener('input', checkForChanges);
  document.getElementById('serviceCoordinatorLastName').addEventListener('input', checkForChanges);
  document.getElementById('addReminderBtn').addEventListener('click', () => addReminder());
  document.getElementById('reminderInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addReminder();
  });
  document.getElementById('addGoalBtn').addEventListener('click', () => addGoal());
  document.getElementById('goalInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addGoal();
  });
  document.getElementById('interventionistNotes').addEventListener('input', checkForChanges);
  document.getElementById('ifspStartDate').addEventListener('input', checkForChanges);
  document.getElementById('language').addEventListener('input', checkForChanges);
  document.getElementById('addrStreet').addEventListener('input', checkForChanges);
  document.getElementById('addrStreet2').addEventListener('input', checkForChanges);
  document.getElementById('addrCity').addEventListener('input', checkForChanges);
  document.getElementById('addrState').addEventListener('input', checkForChanges);
  document.getElementById('addrZip').addEventListener('input', checkForChanges);
  document.getElementById('addFamilyMemberBtn').addEventListener('click', addFamilyMember);
  document.getElementById('familyMembersList').addEventListener('input', (e) => {
    const inp = e.target.closest('[data-index]');
    if (!inp) return;
    const idx = Number(inp.dataset.index);
    const field = inp.dataset.field;
    if (currentFamilyMembers[idx] !== undefined) {
      currentFamilyMembers[idx][field] = inp.value;
      checkForChanges();
    }
  });
  document.getElementById('clientUsersList').addEventListener('input', handleClientUserChange);
  document.getElementById('clientUsersList').addEventListener('change', handleClientUserChange);

  console.log('EIS Kids Client initialized');

  // FileMaker WebViewer keyboard fix (iPad + external keyboard):
  // Keep a hidden input focused whenever no real input is active.
  // This prevents FileMaker from intercepting spacebar and arrow keys
  // at the native UIKit level before they reach this WebViewer.
  const focusSink = document.getElementById('fmKeyboardFocusSink');
  if (focusSink) {
    document.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active === focusSink) {
          focusSink.focus({ preventScroll: true });
        }
      });
    });
    focusSink.focus({ preventScroll: true });
  }

  // Hamburger menu
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const hamburgerMenu = document.getElementById('hamburgerMenu');

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = hamburgerMenu.classList.contains('open');
    hamburgerMenu.classList.toggle('open', !isOpen);
    hamburgerBtn.setAttribute('aria-expanded', String(!isOpen));
    hamburgerMenu.setAttribute('aria-hidden', String(isOpen));
  });

  document.addEventListener('click', () => {
    hamburgerMenu.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    hamburgerMenu.setAttribute('aria-hidden', 'true');
  });

  hamburgerMenu.addEventListener('click', (e) => e.stopPropagation());

  // Wire up hamburger menu items
  document.querySelectorAll('.hamburger-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      switchPage(item.dataset.page);
      hamburgerMenu.classList.remove('open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
      hamburgerMenu.setAttribute('aria-hidden', 'true');
    });
  });

  // Header back button
  document.getElementById('backBtn').addEventListener('click', () => {
    const clientsPage = document.getElementById('clientsPage');
    const mainContent = document.getElementById('mainContent');
    const accountsPage = document.getElementById('accountsPage');
    const accountDetailsCard = document.querySelector('#accountsPage .details-card');
    const accountDetailsOpen = accountsPage && accountsPage.style.display !== 'none'
      && accountDetailsCard && accountDetailsCard.style.display !== 'none';

    if (clientsPage && clientsPage.style.display !== 'none' &&
        mainContent && mainContent.style.display !== 'none') {
      // --- Clients page: record open ---
      // If there is a previous client record, restore it (record-to-record back).
      // Otherwise close the record and return to the previous top-level page.
      if (previousChildData) {
        const saved = previousChildData;
        previousChildData = null;
        suppressHistoryOnce = true;
        renderInterface(saved);
      } else {
        mainContent.style.display = 'none';
        currentChild = null;
        document.getElementById('savebar').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
        if (previousPage) {
          switchPage(previousPage, { skipReload: true });
        }
      }
    } else if (accountDetailsOpen && previousAccount) {
      // --- Accounts page: detail open, previous account exists ---
      // Restore the previous account record (record-to-record back).
      const prev = previousAccount;
      previousAccount = null;
      _populateAccountForm(prev);
    } else if (accountDetailsOpen) {
      // --- Accounts page: detail open, no previous account ---
      // Close the detail panel and show the list.
      accountDetailsCard.style.display = 'none';
      currentAccount = null;
      document.getElementById('savebar').style.display = 'none';
      document.getElementById('backBtn').style.display =
        previousPage ? '' : 'none';
    } else if (previousPage) {
      // --- Any other page: navigate to previous top-level page ---
      switchPage(previousPage, { skipReload: true });
    }
  });

  // Initialize in "New Client" state (hide content on first load)
  initializeNewClientState(false);
  initAccountsPage();
}

// Initialize interface to New Client state
function initializeNewClientState(showContent = true) {
  // Clear the form
  document.getElementById('firstName').value = '';
  document.getElementById('lastName').value = '';
  document.getElementById('clientId').value = '';
  document.getElementById('county').value = '';
  document.getElementById('serviceCoordinatorFirstName').value = '';
  document.getElementById('serviceCoordinatorLastName').value = '';
  document.getElementById('ifspStartDate').value = '';
  document.getElementById('language').value = '';
  currentClientUsers = [];
  displayClientUsers();

  // Clear address fields as well (was missing, caused previous address to persist)
  document.getElementById('addrStreet').value = '';
  document.getElementById('addrStreet2').value = '';
  document.getElementById('addrCity').value = '';
  document.getElementById('addrState').value = '';
  document.getElementById('addrZip').value = '';
  document.getElementById('addrStreet').value = '';
  document.getElementById('addrStreet2').value = '';
  document.getElementById('addrCity').value = '';
  document.getElementById('addrState').value = '';
  document.getElementById('addrZip').value = '';
  currentFamilyMembers = [];
  displayFamilyMembers();
  currentReminders = [];
  displayReminders();
  currentGoals = [];
  displayGoals();
  document.getElementById('interventionistNotes').value = '';
  document.getElementById('sessionNotesList').innerHTML = `
    <div class="empty-state">
      <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
        <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="16" y1="28" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>Select a client to view session notes</p>
    </div>
  `;
  // Hide save button
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    document.getElementById('savebar').style.display = 'none';
  }

  // Show main content only when triggered by user action
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = showContent ? '' : 'none';

  // Show/hide back button alongside mainContent
  const backBtnInit = document.getElementById('backBtn');
  if (backBtnInit) backBtnInit.style.display = showContent ? '' : 'none';

  currentChild = null;
}

// Handle search functionality
function handleSearch() {
  const searchFirstName = document.getElementById('searchFirstName').value.trim();
  const searchLastName = document.getElementById('searchLastName').value.trim();
  
  if (!searchFirstName && !searchLastName) {
    showModal('Please enter at least a first name or last name');
    return;
  }

  // Call FileMaker script to search
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify({
      mode: 'search',
      firstName: searchFirstName,
      lastName: searchLastName
    }));
  } else {
    console.log('FileMaker not available - searching for:', { firstName: searchFirstName, lastName: searchLastName });
    // For testing without FileMaker
    displaySearchResults([
      { id: '1', firstName: 'John', lastName: 'Doe' },
      { id: '2', firstName: 'Jane', lastName: 'Smith' }
    ]);
  }
}

// Check for unsaved changes
function checkForChanges() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const clientId = document.getElementById('clientId').value.trim();
  const county = document.getElementById('county').value.trim();
  const serviceCoordinatorValues = getServiceCoordinatorValues();
  const serviceCoordinator = serviceCoordinatorValues.fullName;
  const interventionistNotes = document.getElementById('interventionistNotes').value;
  const saveBtn = document.getElementById('saveBtn');
  
  // Check if there are changes compared to current child data
  const ifspStartDate = document.getElementById('ifspStartDate').value;
  const language = document.getElementById('language').value.trim();
  const addrStreet = document.getElementById('addrStreet').value.trim();
  const addrStreet2 = document.getElementById('addrStreet2').value.trim();
  const addrCity = document.getElementById('addrCity').value.trim();
  const addrState = document.getElementById('addrState').value.trim();
  const addrZip = document.getElementById('addrZip').value.trim();

  const savedServiceCoordinator = getStoredServiceCoordinatorValues(currentChild);

  const hasChanges = currentChild ? 
    (firstName !== currentChild.firstName || lastName !== currentChild.lastName ||
     clientId !== (currentChild.clientId || '') ||
     county !== (currentChild.county || '') ||
     serviceCoordinatorValues.firstName !== savedServiceCoordinator.firstName ||
     serviceCoordinatorValues.lastName !== savedServiceCoordinator.lastName ||
     ifspStartDate !== (currentChild.ifspStartDate || '') ||
     language !== (currentChild.language || '') ||
     addrStreet !== (currentChild.addrStreet || '') || addrStreet2 !== (currentChild.addrStreet2 || '') ||
     addrCity !== (currentChild.addrCity || '') ||
     addrState !== (currentChild.addrState || '') || addrZip !== (currentChild.addrZip || '') ||
     JSON.stringify(currentFamilyMembers) !== JSON.stringify(currentChild.familyMembers || []) ||
     JSON.stringify(currentReminders) !== JSON.stringify(currentChild.reminders || []) ||
     JSON.stringify(currentGoals) !== JSON.stringify(currentChild.goals || []) ||
     JSON.stringify(currentClientUsers) !== JSON.stringify(currentChild.clientUser || []) ||
     interventionistNotes !== (currentChild.interventionistNotes || '')) :
    (firstName !== '' || lastName !== '' || clientId !== '' ||
     county !== '' || serviceCoordinatorValues.fullName !== '' ||
     ifspStartDate !== '' || language !== '' ||
     addrStreet !== '' || addrStreet2 !== '' || addrCity !== '' || addrState !== '' || addrZip !== '' ||
     currentFamilyMembers.length > 0 || currentClientUsers.length > 0 ||
     currentReminders.length > 0 || currentGoals.length > 0 || interventionistNotes !== '');
  
  if (hasChanges) {
    // Show button and turn it green for unsaved changes
    document.getElementById('savebar').style.display = '';
    saveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    saveBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
    
    // Update button text based on whether it's a new client or editing existing
    const buttonText = currentChild ? 'Save' : 'Save New Client';
    const buttonTextNode = saveBtn.childNodes[2]; // Text node after SVG
    if (buttonTextNode && buttonTextNode.nodeType === Node.TEXT_NODE) {
      buttonTextNode.textContent = buttonText;
    }
  } else {
    // Hide button when no changes
    document.getElementById('savebar').style.display = 'none';
  }
}

// Handle save child
function handleSave() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const clientId = document.getElementById('clientId').value.trim();
  const county = document.getElementById('county').value.trim();
  const serviceCoordinatorValues = getServiceCoordinatorValues();
  const serviceCoordinator = serviceCoordinatorValues.fullName;
  const ifspStartDate = document.getElementById('ifspStartDate').value;
  const language = document.getElementById('language').value.trim();
  const addrStreet = document.getElementById('addrStreet').value.trim();
  const addrStreet2 = document.getElementById('addrStreet2').value.trim();
  const addrCity = document.getElementById('addrCity').value.trim();
  const addrState = document.getElementById('addrState').value.trim();
  const addrZip = document.getElementById('addrZip').value.trim();
  const interventionistNotes = document.getElementById('interventionistNotes').value;

  if (!firstName || !lastName) {
    showModal('Please enter both first and last name');
    return;
  }

  const childData = {
    mode: 'save',
    id: currentChild?.id || null,
    firstName: firstName,
    lastName: lastName,
    clientId: clientId,
    county: county,
    serviceCoordinator: serviceCoordinator,
    serviceCoordinatorFirstName: serviceCoordinatorValues.firstName,
    serviceCoordinatorLastName: serviceCoordinatorValues.lastName,
    ifspStartDate: ifspStartDate,
    language: language,
    addrStreet: addrStreet,
    addrStreet2: addrStreet2,
    addrCity: addrCity,
    addrState: addrState,
    addrZip: addrZip,
    clientUser: currentClientUsers,
    familyMembers: currentFamilyMembers,
    reminders: currentReminders,
    goals: currentGoals,
    interventionistNotes: interventionistNotes
  };

  // Call FileMaker script to save
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify(childData));
    
    // Update current child data to reflect saved state
    if (currentChild) {
      currentChild.firstName = firstName;
      currentChild.lastName = lastName;
      currentChild.clientId = clientId;
      currentChild.county = county;
      currentChild.serviceCoordinator = serviceCoordinator;
      currentChild.serviceCoordinatorFirstName = serviceCoordinatorValues.firstName;
      currentChild.serviceCoordinatorLastName = serviceCoordinatorValues.lastName;
      currentChild.ifspStartDate = ifspStartDate;
      currentChild.language = language;
      currentChild.addrStreet = addrStreet;
      currentChild.addrStreet2 = addrStreet2;
      currentChild.addrCity = addrCity;
      currentChild.addrState = addrState;
      currentChild.addrZip = addrZip;
      currentChild.clientUser = JSON.parse(JSON.stringify(currentClientUsers));
      currentChild.familyMembers = JSON.parse(JSON.stringify(currentFamilyMembers));
      currentChild.reminders = [...currentReminders];
      currentChild.goals = [...currentGoals];
      currentChild.interventionistNotes = interventionistNotes;
    }
    
    // Reset button color after save
    checkForChanges();
  } else {
    console.log('FileMaker not available - saving:', childData);
    showModal('Child saved successfully');
  }
}

// Handle new client (clear form)
function handleClear() {
  // Navigate to clients page if currently on dashboard
  const dashboardPage = document.getElementById('dashboardPage');
  if (dashboardPage && dashboardPage.style.display !== 'none') {
    dashboardPage.style.display = 'none';
    document.getElementById('accountsPage').style.display = 'none';
    document.getElementById('clientsPage').style.display = '';
    const headerTitle = document.querySelector('.header-content h1');
    const headerSubtitle = document.querySelector('.header-subtitle');
    if (headerTitle) headerTitle.textContent = 'Client Management';
    if (headerSubtitle) headerSubtitle.textContent = 'Manage clients and session notes';
    document.querySelectorAll('.hamburger-menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === 'clients');
    });
  }

  // Show the client form
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = '';

  // Show back button when a record is open
  const backBtnClear = document.getElementById('backBtn');
  if (backBtnClear) backBtnClear.style.display = '';

  // Call FileMaker script for new client
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify({
      mode: 'newClient'
    }));
  } else {
    console.log('FileMaker not available - creating new client');
  }
  
  // Clear the form
  document.getElementById('firstName').value = '';
  document.getElementById('lastName').value = '';
  document.getElementById('clientId').value = '';
  document.getElementById('county').value = '';
  document.getElementById('serviceCoordinatorFirstName').value = '';
  document.getElementById('serviceCoordinatorLastName').value = '';
  document.getElementById('ifspStartDate').value = '';
  document.getElementById('language').value = '';
  currentClientUsers = [];
  displayClientUsers();

  currentFamilyMembers = [];
  displayFamilyMembers();
  currentReminders = [];
  displayReminders();
  currentGoals = [];
  displayGoals();
  document.getElementById('interventionistNotes').value = '';
  document.getElementById('sessionNotesList').innerHTML = `
    <div class="empty-state">
      <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
        <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="16" y1="28" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>Select a client to view session notes</p>
    </div>
  `;
  // Reset save button color
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    document.getElementById('savebar').style.display = 'none';
  }
  
  currentChild = null;
}

// Handle export session notes
function handleExport() {
  const exportTypeEl = document.querySelector('input[name="exportType"]:checked');
  const exportType = exportTypeEl ? exportTypeEl.value : 'sessionNotes';
  const mode = exportType === 'payroll' ? 'exportPayroll' : 'exportSessionNotes';

  let payload = { mode };

  if (exportType === 'payroll') {
    const startDate = document.getElementById('exportStartDate').value;
    const endDate = document.getElementById('exportEndDate').value;

    if (!startDate || !endDate) {
      showModal('Please select both a start date and an end date');
      return;
    }

    if (startDate > endDate) {
      showModal('Start date must be on or before the end date');
      return;
    }

    payload.startDate = startDate;
    payload.endDate = endDate;
  }

  document.getElementById('exportModal').style.display = 'none';

  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify(payload));
  } else {
    console.log('FileMaker not available - exporting:', payload);
  }
}

// Handle add note
function handleAddNote(serviceProvider) {
  if (!currentChild) {
    showModal('Please select a client first');
    return;
  }

  const payload = {
    mode: 'addNote',
    childId: currentChild.id,
    clientId: currentChild.clientId || '',
    county: currentChild.county || '',
    serviceCoordinator: currentChild.serviceCoordinator || '',
    serviceProvider: serviceProvider || null
  };

  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify(payload));
  } else {
    console.log('FileMaker not available - adding note:', payload);
  }
}

// Handle viewing an existing session note
function handleViewSessionNote(note) {
  if (!note) {
    console.error('No session note provided for viewSessionNote');
    return;
  }

  const payload = {
    mode: 'viewSessionNote',
    childId: currentChild?.id || null,
    noteId: note.id || note.__ID || note.noteId || note.rid || null,
    sessionNote: note
  };

  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify(payload));
  } else {
    console.log('FileMaker not available - viewing session note:', payload);
  }
}

// Display search results
function displaySearchResults(data) {
  console.log('displaySearchResults called with:', data);
  console.log('Type of data:', typeof data);
  
  const searchResults = document.getElementById('searchResults');
  
  // Parse data if it's a string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
      console.log('Parsed data:', data);
    } catch (e) {
      console.error('Failed to parse search data:', e);
      searchResults.innerHTML = `
        <div class="empty-state">
          <p>Error parsing search results</p>
        </div>
      `;
      return;
    }
  }
  
  // Handle OData format from FileMaker
  let results = data;
  if (data && data.value) {
    // OData format - extract the value array
    results = data.value;
    console.log('Extracted value array, length:', results.length);
  }
  
  // Handle simple array format
  if (!Array.isArray(results)) {
    console.log('Results is not an array:', results);
    results = [];
  }
  
  console.log('Final results array length:', results.length);
  
  if (results.length === 0) {
    searchResults.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2"/>
          <path d="M16 24H32M24 16V32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No clients found</p>
      </div>
    `;
    return;
  }

  let html = '<div class="results-list">';
  results.forEach(child => {
    // Support both formats: {id, firstName, lastName} and {__ID, firstName, lastName}
    const childId = child.id || child.__ID;
    console.log('Adding client:', child.firstName, child.lastName, 'ID:', childId);
    html += `
      <div class="result-item" onclick="window.loadChild('${childId}')">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
          <circle cx="10" cy="7" r="4" stroke="#0077aa" stroke-width="2"/>
          <path d="M4 18C4 14 6 12 10 12C14 12 16 14 16 18" stroke="#0077aa" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <strong>${child.firstName} ${child.lastName}</strong>
      </div>
    `;
  });
  html += '</div>';
  
  searchResults.innerHTML = html;
  console.log('Search results displayed successfully');
}

// Load child details
function loadChild(childId) {
  // Close search modal
  document.getElementById('searchModal').style.display = 'none';
  
  // Call FileMaker script to get client details
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify({
      mode: 'getDetails',
      childId: childId
    }));
  } else {
    console.log('FileMaker not available - loading client from local JSON:', childId);
    renderInterface(DEV_CLIENT_DATA, DEV_USERS_DATA);
  }
}

// Main render function - called from FileMaker
function renderInterface(data, users) {
  console.log('renderInterface called with:', data);
  console.log('Type of data:', typeof data);
  
  if (!data) {
    console.error('No data provided to renderInterface');
    return;
  }

  // Parse data if it's a string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
      console.log('Parsed data:', data);
    } catch (e) {
      console.error('Failed to parse data:', e);
      return;
    }
  }

  // Populate service coordinator select from users param
  if (users) {
    if (typeof users === 'string') {
      try { users = JSON.parse(users); } catch (e) { users = null; }
    }
    let userList = users;
    if (users && users.value && Array.isArray(users.value)) userList = users.value;
    if (Array.isArray(userList)) {
      currentUserList = userList;
      console.log('User list received:', userList.length, 'users');
    }
  }

  // Handle OData format - extract first client from value array
  if (data && data.value && Array.isArray(data.value) && data.value.length > 0) {
    console.log('OData format detected, extracting first client from value array');
    data = data.value[0];
  }

  // Snapshot raw data here (after unwrapping) for record-level back navigation.
  // If a different client is already open, push the previous raw data into the
  // back-navigation cache so the user can return to it.
  const incomingId = data.id || data.__ID;
  if (currentChild && lastRenderedChildRawData &&
      (currentChild.id || currentChild.__ID) !== incomingId) {
    previousChildData = lastRenderedChildRawData;
  }

  // Parse reminders into array
  let parsedReminders = data.reminders || [];
  if (typeof parsedReminders === 'string') {
    try { parsedReminders = JSON.parse(parsedReminders); } catch (e) {
      parsedReminders = parsedReminders ? [parsedReminders] : [];
    }
  }
  if (!Array.isArray(parsedReminders)) parsedReminders = [];
  currentReminders = parsedReminders;

  // Parse goals into array
  let parsedGoals = data.goals || [];
  if (typeof parsedGoals === 'string') {
    try { parsedGoals = JSON.parse(parsedGoals); } catch (e) {
      parsedGoals = parsedGoals ? [parsedGoals] : [];
    }
  }
  if (!Array.isArray(parsedGoals)) parsedGoals = [];
  currentGoals = parsedGoals;

  // Parse family members into array
  let parsedFamilyMembers = data.familyMembers || [];
  if (typeof parsedFamilyMembers === 'string') {
    try { parsedFamilyMembers = JSON.parse(parsedFamilyMembers); } catch (e) {
      parsedFamilyMembers = [];
    }
  }
  if (!Array.isArray(parsedFamilyMembers)) parsedFamilyMembers = [];
  currentFamilyMembers = parsedFamilyMembers;

  // Update current child - support both __ID and id
  currentChild = {
    id: data.id || data.__ID,
    firstName: data.firstName,
    lastName: data.lastName,
    clientId: data.clientId || '',
    county: data.county || '',
    serviceCoordinator: data.serviceCoordinator || '',
    serviceCoordinatorFirstName: data.serviceCoordinatorFirstName || '',
    serviceCoordinatorLastName: data.serviceCoordinatorLastName || '',
    clientUser: JSON.parse(JSON.stringify(Array.isArray(data.clientUser) ? data.clientUser : [])),
    ifspStartDate: data.ifspStartDate || '',
    language: data.language || '',
    addrStreet: data.addrStreet || '',
    addrStreet2: data.addrStreet2 || '',
    addrCity: data.addrCity || '',
    addrState: data.addrState || '',
    addrZip: data.addrZip || '',
    familyMembers: JSON.parse(JSON.stringify(parsedFamilyMembers)),
    reminders: [...currentReminders],
    goals: [...currentGoals],
    interventionistNotes: data.interventionistNotes || ''
  };

  console.log('Setting firstName to:', data.firstName);
  console.log('Setting lastName to:', data.lastName);
  console.log('Using ID:', currentChild.id);

  // Populate form fields
  const firstNameInput = document.getElementById('firstName');
  const lastNameInput = document.getElementById('lastName');
  
  if (firstNameInput && lastNameInput) {
    firstNameInput.value = data.firstName || '';
    lastNameInput.value = data.lastName || '';
    document.getElementById('clientId').value = data.clientId || '';
    document.getElementById('county').value = data.county || '';
    setServiceCoordinatorValues(data.serviceCoordinatorFirstName, data.serviceCoordinatorLastName, data.serviceCoordinator || '');
    currentClientUsers = JSON.parse(JSON.stringify(Array.isArray(data.clientUser) ? data.clientUser : []));
    displayClientUsers();
    displayReminders();
    displayGoals();
    document.getElementById('interventionistNotes').value = data.interventionistNotes || '';
    document.getElementById('ifspStartDate').value = data.ifspStartDate || '';
    document.getElementById('language').value = data.language || '';
    document.getElementById('addrStreet').value = data.addrStreet || '';
    document.getElementById('addrStreet2').value = data.addrStreet2 || '';
    document.getElementById('addrCity').value = data.addrCity || '';
    document.getElementById('addrState').value = data.addrState || '';
    document.getElementById('addrZip').value = data.addrZip || '';
    displayFamilyMembers();
    console.log('Form fields populated successfully');
  } else {
    console.error('Form fields not found!');
  }

  // Display session notes
  try {
    displaySessionNotes(data.sessionNotes || data.notes || []);
  } catch (error) {
    console.error('Failed to display session notes:', error);
    displaySessionNotes([]);
  }

  
  // Show main content
  const mainContent = document.getElementById('mainContent');
  if (mainContent) mainContent.style.display = '';

  // Show delete button only for existing clients (those with an ID)
  const deleteClientBtn = document.getElementById('deleteClientBtn');
  if (deleteClientBtn) {
    deleteClientBtn.style.display = currentChild?.id ? '' : 'none';
  }

  // Switch to clients page in case dashboard or accounts page is active.
  // switchPage will also show the back button because mainContent is now visible
  // (clientRecordOpen check) and hide the loading screen if still up.
  switchPage('clients');

  // Store this call's raw data for potential back navigation next time
  lastRenderedChildRawData = data;

  // Hide save button — no unsaved changes immediately after load
  document.getElementById('savebar').style.display = 'none';
  console.log('Interface rendered for client:', currentChild);
}

// Display session notes
function displaySessionNotes(notes) {
  const notesList = document.getElementById('sessionNotesList');

  // Normalize notes payload across supported formats
  if (typeof notes === 'string') {
    try {
      notes = JSON.parse(notes);
    } catch (error) {
      console.error('Failed to parse session notes string:', error);
      notes = [];
    }
  }

  if (notes && notes.value && Array.isArray(notes.value)) {
    notes = notes.value;
  }

  if (!Array.isArray(notes)) {
    notes = [];
  }

  const getNoteTimestamp = (note) => {
    const raw = String(note?.date || note?.noteDate || note?.createdAt || '').trim();
    if (!raw) return Number.NEGATIVE_INFINITY;

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return Date.UTC(Number(year), Number(month) - 1, Number(day));
    }

    const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return Date.UTC(Number(year), Number(month) - 1, Number(day));
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? Number.NEGATIVE_INFINITY : parsed.getTime();
  };

  const sortedNotes = [...notes].sort((a, b) => getNoteTimestamp(b) - getNoteTimestamp(a));
  
  if (!sortedNotes || sortedNotes.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="16" y1="28" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No session notes available</p>
      </div>
    `;
    return;
  }

  let html = '';
  sortedNotes.forEach((note, index) => {
    const noteDateRaw = note.date || note.noteDate || note.createdAt || '';
    const noteDate = formatDisplayDate(noteDateRaw);
    const noteText = note.note || note.text || note.sessionNote || '';
    const noteStatus = String(note.status || '').trim();
    const isDraft = noteStatus.toLowerCase() === 'draft';

    html += `
      <div class="note-item${isDraft ? ' note-item--draft' : ''}" data-note-index="${index}">
        <div class="note-header">
          <span class="note-date">${noteDate}</span>
          <div class="note-header-right">
            ${noteStatus ? `<span class="note-status">${noteStatus}</span>` : ''}
            ${isDraft ? `
            <button class="note-delete-btn" data-note-index="${index}" title="Delete draft">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Delete
            </button>` : ''}
          </div>
        </div>
        <div class="note-content">${noteText}</div>
      </div>
    `;
  });
  
  notesList.innerHTML = html;

  const renderedNoteItems = notesList.querySelectorAll('.note-item[data-note-index]');
  renderedNoteItems.forEach((noteItem) => {
    noteItem.addEventListener('click', () => {
      const noteIndex = Number(noteItem.dataset.noteIndex);
      const selectedNote = Number.isNaN(noteIndex) ? null : sortedNotes[noteIndex];
      if (!selectedNote) {
        console.error('Unable to resolve clicked session note');
        return;
      }
      handleViewSessionNote(selectedNote);
    });
  });

  // Delete buttons on Draft notes
  notesList.querySelectorAll('.note-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent triggering handleViewSessionNote
      const noteIndex = Number(btn.dataset.noteIndex);
      const note = Number.isNaN(noteIndex) ? null : sortedNotes[noteIndex];
      if (!note) return;
      const noteId = note.id || note.__ID || note.noteId || note.rid || null;
      showConfirmModal(
        'This will permanently delete this draft session note. This action cannot be undone.',
        () => {
          if (window.FileMaker) {
            window.FileMaker.PerformScript('Manage: Client', JSON.stringify({
              mode: 'deleteSessionNote',
              noteId,
              childId: currentChild?.id || null
            }));
          } else {
            console.log('FileMaker not available - deleteSessionNote:', noteId);
          }
          // Remove the note from the displayed list immediately
          const noteItem = btn.closest('.note-item');
          if (noteItem) noteItem.remove();
          if (notesList.querySelectorAll('.note-item').length === 0) {
            notesList.innerHTML = `
              <div class="empty-state">
                <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
                  <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="16" y1="28" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>No session notes available</p>
              </div>
            `;
          }
        }
      );
    });
  });
}

// Update client ID after new client is saved - called from FileMaker
function updateClientId(clientId) {
  console.log('updateClientId called with:', clientId);
  
  if (!clientId) {
    console.error('No client ID provided');
    return;
  }
  
  // Parse if it's a JSON string
  let id = clientId;
  if (typeof clientId === 'string' && clientId.startsWith('{')) {
    try {
      const parsed = JSON.parse(clientId);
      id = parsed.id || parsed.__ID || clientId;
    } catch (e) {
      // Not JSON, use as-is
    }
  }
  
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const clientIdValue = document.getElementById('clientId').value.trim();
  const county = document.getElementById('county').value.trim();
  const serviceCoordinatorValues = getServiceCoordinatorValues();
  const serviceCoordinator = serviceCoordinatorValues.fullName;
  const interventionistNotes = document.getElementById('interventionistNotes').value;
  const ifspStartDateVal = document.getElementById('ifspStartDate').value;
  const languageVal = document.getElementById('language').value.trim();
  const addrStreetVal = document.getElementById('addrStreet').value.trim();
  const addrStreet2Val = document.getElementById('addrStreet2').value.trim();
  const addrCityVal = document.getElementById('addrCity').value.trim();
  const addrStateVal = document.getElementById('addrState').value.trim();
  const addrZipVal = document.getElementById('addrZip').value.trim();

  // Update current child with the new ID
  currentChild = {
    id: id,
    firstName: firstName,
    lastName: lastName,
    clientId: clientIdValue,
    county: county,
    serviceCoordinator: serviceCoordinator,
    serviceCoordinatorFirstName: serviceCoordinatorValues.firstName,
    serviceCoordinatorLastName: serviceCoordinatorValues.lastName,
    clientUser: currentClientUsers,
    ifspStartDate: ifspStartDateVal,
    language: languageVal,
    addrStreet: addrStreetVal,
    addrStreet2: addrStreet2Val,
    addrCity: addrCityVal,
    addrState: addrStateVal,
    addrZip: addrZipVal,
    familyMembers: [...currentFamilyMembers],
    reminders: [...currentReminders],
    interventionistNotes: interventionistNotes
  };

  console.log('Client ID updated:', id);
  
  // Hide save button since we just saved
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    document.getElementById('savebar').style.display = 'none';
  }
  
  console.log('Interface updated with client ID:', currentChild);
}

// Display reminders list
function displayReminders() {
  const list = document.getElementById('remindersList');
  if (!list) return;
  if (!currentReminders || currentReminders.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = currentReminders.map((text, i) => `
    <div class="reminder-item">
      <span class="reminder-text">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
      <button class="reminder-delete-btn" aria-label="Delete reminder" onclick="window.deleteReminder(${i})">&#x2715;</button>
    </div>
  `).join('');
}

// Add a reminder
function addReminder() {
  const input = document.getElementById('reminderInput');
  const text = input.value.trim();
  if (!text) return;
  currentReminders.push(text);
  input.value = '';
  displayReminders();
  checkForChanges();
}

// Delete a reminder by index
function deleteReminder(index) {
  currentReminders.splice(index, 1);
  displayReminders();
  checkForChanges();
}

window.deleteReminder = deleteReminder;

// Display goals list
function displayGoals() {
  const list = document.getElementById('goalsList');
  if (!list) return;
  if (!currentGoals || currentGoals.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = currentGoals.map((text, i) => `
    <div class="goal-item">
      <span class="goal-text">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
      <button class="goal-delete-btn" aria-label="Delete goal" onclick="window.deleteGoal(${i})">&#x2715;</button>
    </div>
  `).join('');
}

// Add a goal
function addGoal() {
  const input = document.getElementById('goalInput');
  const text = input.value.trim();
  if (!text) return;
  currentGoals.push(text);
  input.value = '';
  displayGoals();
  checkForChanges();
}

// Delete a goal by index
function deleteGoal(index) {
  currentGoals.splice(index, 1);
  displayGoals();
  checkForChanges();
}

window.deleteGoal = deleteGoal;

// Display family members list
function displayFamilyMembers() {
  const list = document.getElementById('familyMembersList');
  if (!list) return;
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!currentFamilyMembers || currentFamilyMembers.length === 0) {
    list.innerHTML = '<p class="family-members-empty">No family members added yet.</p>';
    return;
  }
  list.innerHTML = currentFamilyMembers.map((m, i) => `
    <div class="family-member-row" data-index="${i}">
      <input type="text" class="fm-input" data-index="${i}" data-field="name" value="${esc(m.name)}" placeholder="Full name" />
      <input type="text" class="fm-input" data-index="${i}" data-field="role" value="${esc(m.role)}" placeholder="Role" />
      <input type="text" class="fm-input" data-index="${i}" data-field="phone" value="${esc(m.phone)}" placeholder="Phone" />
      <input type="text" class="fm-input" data-index="${i}" data-field="email" value="${esc(m.email)}" placeholder="Email" />
      <button class="reminder-delete-btn" aria-label="Remove member" onclick="window.deleteFamilyMember(${i})">&#x2715;</button>
    </div>
  `).join('');
}

// Add an empty family member row
function addFamilyMember() {
  currentFamilyMembers.push({ name: '', role: '', phone: '', email: '' });
  displayFamilyMembers();
  const newIdx = currentFamilyMembers.length - 1;
  const newInput = document.querySelector(`#familyMembersList [data-index="${newIdx}"][data-field="name"]`);
  if (newInput) newInput.focus();
  checkForChanges();
}

// Delete a family member by index
function deleteFamilyMember(index) {
  currentFamilyMembers.splice(index, 1);
  displayFamilyMembers();
  checkForChanges();
}

window.deleteFamilyMember = deleteFamilyMember;

// Handle input/change events inside the clientUsersList
function handleClientUserChange(e) {
  const el = e.target.closest('[data-cu-index]');
  if (!el) return;
  // Avoid double-firing: input fires on text/number/date, change fires on select
  if (e.type === 'input' && el.tagName === 'SELECT') return;
  if (e.type === 'change' && el.tagName !== 'SELECT') return;

  const idx = Number(el.dataset.cuIndex);
  const field = el.dataset.cuField;
  if (currentClientUsers[idx] === undefined) return;

  currentClientUsers[idx][field] = el.value;

  // When userId changes, also sync the display name (user field)
  if (field === 'userId') {
    const matched = currentUserList.find(u => (u.staffId || u.userId || u.__ID) === el.value);
    currentClientUsers[idx].user = matched
      ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim()
      : '';
  }

  checkForChanges();
}

// Display client users (service providers) list
function displayClientUsers() {
  const list = document.getElementById('clientUsersList');
  if (!list) return;
  if (!currentClientUsers || currentClientUsers.length === 0) {
    list.innerHTML = '<p class="client-users-empty">No service providers on record.</p>';
    return;
  }
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isoDate = v => (v ? String(v).split('T')[0] : '');

  const userOptions = currentUserList.map(u => {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
    return { id: u.staffId || u.userId || u.__ID, name };
  });

  list.innerHTML = currentClientUsers.map((cu, i) => {
    const selectedId = cu.userId || '';
    const optionsHtml = userOptions.map(u =>
      `<option value="${esc(u.id)}"${u.id === selectedId ? ' selected' : ''}>${esc(u.name)}</option>`
    ).join('');

    return `
      <div class="client-user-row">
        <select class="cu-input" data-cu-index="${i}" data-cu-field="userId">
          <option value="">Select…</option>
          ${optionsHtml}
        </select>
        <input type="text"   class="cu-input" data-cu-index="${i}" data-cu-field="methodAbbr" value="${esc(cu.methodAbbr)}" placeholder="Code" />
        <input type="text"   class="cu-input" data-cu-index="${i}" data-cu-field="frequency"  value="${esc(cu.frequency)}"  placeholder="Frequency" />
        <input type="number" class="cu-input" data-cu-index="${i}" data-cu-field="duration"   value="${esc(cu.duration)}"   placeholder="Dur." min="0" />
        <input type="date"   class="cu-input" data-cu-index="${i}" data-cu-field="dateStart"  value="${isoDate(cu.dateStart)}" />
        <input type="date"   class="cu-input" data-cu-index="${i}" data-cu-field="dateEnd"    value="${isoDate(cu.dateEnd)}" />
        <button class="btn btn-add cu-add-note-btn" data-cu-index="${i}" type="button">
          <svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.75"/>
            <path d="M5 8H11M5 11H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Add Note
        </button>
      </div>
    `;
  }).join('');
}

// Duration input formatting (h:mm)
// ===== Role multi-select helpers =====
function getRoles() {
  return Array.from(document.querySelectorAll('#accountRoleDropdown input[type="checkbox"]:checked'))
    .map(cb => cb.value);
}

function setRoles(roles) {
  const vals = Array.isArray(roles) ? roles : (roles ? [roles] : []);
  document.querySelectorAll('#accountRoleDropdown input[type="checkbox"]').forEach(cb => {
    cb.checked = vals.includes(cb.value);
  });
  updateRolePills();
}

function clearRoles() {
  document.querySelectorAll('#accountRoleDropdown input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  updateRolePills();
}

function updateRolePills() {
  const selected = getRoles();
  const display = document.getElementById('accountRolePills');
  if (!display) return;
  if (selected.length === 0) {
    display.innerHTML = '<span class="role-placeholder">Select roles…</span>';
  } else {
    display.innerHTML = selected.map(r => `<span class="role-pill">${r}</span>`).join('');
  }
}

function updateSupervisorFields(account) {
  const roles = getRoles();

  const cotaGroup = document.getElementById('cotaSupervisorGroup');
  const cfGroup = document.getElementById('cfSupervisorGroup');
  const cotaSelect = document.getElementById('cotaSupervisorSelect');
  const cfSelect = document.getElementById('cfSupervisorSelect');

  // COTA Supervisor field
  const hasCOTA = roles.includes('COTA');
  cotaGroup.style.display = hasCOTA ? '' : 'none';
  if (hasCOTA) {
    const supervisors = allAccounts.filter(a => {
      const r = Array.isArray(a.role) ? a.role : (a.role ? [a.role] : []);
      return r.includes('COTA Supervisor');
    });
    const currentVal = account?.cotaSupervisorId || '';
    cotaSelect.innerHTML = '<option value="">Select COTA Supervisor…</option>' +
      supervisors.map(s => `<option value="${s.__ID || s.id}">${s.firstName} ${s.lastName}</option>`).join('');
    cotaSelect.value = currentVal;
  }

  // CF Supervisor field
  const hasCF = roles.includes('CF');
  cfGroup.style.display = hasCF ? '' : 'none';
  if (hasCF) {
    const supervisors = allAccounts.filter(a => {
      const r = Array.isArray(a.role) ? a.role : (a.role ? [a.role] : []);
      return r.includes('CF Supervisor');
    });
    const currentVal = account?.cfSupervisorId || '';
    cfSelect.innerHTML = '<option value="">Select CF Supervisor…</option>' +
      supervisors.map(s => `<option value="${s.__ID || s.id}">${s.firstName} ${s.lastName}</option>`).join('');
    cfSelect.value = currentVal;
  }
}

// Initialize accounts page event listeners
function initAccountsPage() {
  const accountUsername = document.getElementById('accountUsername');
  const accountFirstName = document.getElementById('accountFirstName');
  const accountLastName = document.getElementById('accountLastName');
  const accountStatus = document.getElementById('accountStatus');
  const accountStaffId = document.getElementById('accountStaffId');
  const accountPhone = document.getElementById('accountPhone');

  document.getElementById('deleteAccountBtn').addEventListener('click', handleDeleteAccount);

  // "All Accounts" card back button — always closes the detail panel and returns
  // to the list. Account-to-account back navigation is handled by the header
  // back button instead.
  document.getElementById('backToAccountsListBtn').addEventListener('click', () => {
    previousAccount = null; // discard account history when going to list
    const detailsCard = document.querySelector('#accountsPage .details-card');
    if (detailsCard) detailsCard.style.display = 'none';
    currentAccount = null;
    document.getElementById('savebar').style.display = 'none';
  });

  accountUsername.addEventListener('input', checkAccountForChanges);
  accountFirstName.addEventListener('input', checkAccountForChanges);
  accountLastName.addEventListener('input', checkAccountForChanges);
  accountStatus.addEventListener('change', checkAccountForChanges);
  accountStaffId.addEventListener('input', checkAccountForChanges);
  accountPhone.addEventListener('input', checkAccountForChanges);
  document.getElementById('accountPayrollId').addEventListener('input', checkAccountForChanges);
  document.getElementById('accountCredentials').addEventListener('input', checkAccountForChanges);
  document.getElementById('cotaSupervisorSelect').addEventListener('change', checkAccountForChanges);
  document.getElementById('cfSupervisorSelect').addEventListener('change', checkAccountForChanges);

  // Role multi-select: toggle dropdown on control click
  const roleSelect = document.getElementById('accountRoleSelect');
  const roleControl = document.getElementById('accountRoleControl');
  roleControl.addEventListener('click', () => {
    roleSelect.classList.toggle('open');
  });

  // Update pills and trigger change check when a checkbox changes
  document.querySelectorAll('#accountRoleDropdown input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      updateRolePills();
      updateSupervisorFields(currentAccount);
      checkAccountForChanges();
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!roleSelect.contains(e.target)) {
      roleSelect.classList.remove('open');
    }
  });
}

// Load all accounts from FileMaker
function loadAccounts() {
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: UserAccount', JSON.stringify({ mode: 'getAll' }));
  } else {
    console.log('FileMaker not available - loading sample accounts');
    renderAccounts([
      { id: '1', username: 'jsmith', firstName: 'Jane', lastName: 'Smith', role: 'Admin', status: 'Active' },
      { id: '2', username: 'tdoe', firstName: 'Tom', lastName: 'Doe', role: 'Therapist', status: 'Active' },
      { id: '3', username: 'mwilson', firstName: 'Mary', lastName: 'Wilson', role: 'ServiceCoordinator', status: 'Inactive' }
    ]);
  }
}

// Render the accounts list - called from FileMaker or locally
function renderAccounts(data) {
  console.log('renderAccounts called with data:', data);
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse accounts data:', e);
      return;
    }
  }

  console.log('renderAccounts received:', JSON.stringify(data));

  let accounts = data;
  if (data && data.value && Array.isArray(data.value)) {
    accounts = data.value;
  }
  if (!Array.isArray(accounts)) {
    accounts = [];
  }

  console.log('Processing accounts array with length:', accounts.length);

  const accountsList = document.getElementById('accountsList');

  if (accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="16" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M8 40C8 32 14 28 24 28C34 28 40 32 40 40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No user accounts found</p>
      </div>
    `;
    return;
  }

  let html = '';
  accounts.forEach((account, index) => {
    const accountId = account.id || account.__ID;
    const initials = ((account.firstName || '')[0] || '') + ((account.lastName || '')[0] || '');
    const status = (account.status || 'Active').trim();
    const statusClass = status === 'Active' ? 'status-badge-active' : 'status-badge-inactive';
    const roleLabel = account.role === 'ServiceCoordinator' ? 'Service Coordinator' : (account.role || '');
    html += `
      <div class="account-item" data-account-index="${index}">
        <div class="account-item-avatar">${initials.toUpperCase()}</div>
        <div class="account-item-info">
          <div class="account-item-name">${account.firstName || ''} ${account.lastName || ''}</div>
          <div class="account-item-username">${account.username || ''}</div>
          ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
        </div>
        <div class="account-item-badges">
          ${status ? `<span class="${statusClass}">${status}</span>` : ''}
        </div>
      </div>
    `;
  });

  allAccounts = accounts;

  accountsList.innerHTML = html;

  // Attach click listeners after rendering
  const renderedItems = accountsList.querySelectorAll('.account-item[data-account-index]');
  console.log('Found rendered items:', renderedItems.length);
  renderedItems.forEach(item => {
    item.addEventListener('click', () => {
      console.log('Account item clicked, item:', item);
      console.log('item.dataset:', item.dataset);
      const idx = Number(item.dataset.accountIndex);
      console.log('Index value:', idx, 'isNaN:', Number.isNaN(idx));
      if (!Number.isNaN(idx)) {
        console.log('Loading account details for index:', idx, 'account:', accounts[idx]);
        loadAccountDetails(accounts[idx]);
      }
    });
  });

  // Wire up filter input
  const filterInput = document.getElementById('accountFilterInput');
  if (filterInput) {
    filterInput.value = '';
    filterInput.oninput = () => {
      const q = filterInput.value.toLowerCase();
      accountsList.querySelectorAll('.account-item').forEach(el => {
        const text = el.textContent.toLowerCase();
        el.style.display = text.includes(q) ? '' : 'none';
      });
    };
  }
}

// Called by FileMaker when returning full account details
function renderAccountDetails(data) {
  console.log('renderAccountDetails called with:', data);
  
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse account details:', e);
      return;
    }
  }
  
  // Handle wrapped response
  if (data && data.value) {
    data = data.value;
  }
  
  if (!data) {
    console.log('No data received, returning');
    return;
  }
  
  // Populate form without calling FileMaker again
  _populateAccountForm(data);
}

// Internal function to populate the account form (doesn't call FileMaker)
function _populateAccountForm(account) {
  console.log('_populateAccountForm called with:', account);
  if (!account) {
    console.log('Account is null/undefined, returning');
    return;
  }

  currentAccount = { id: account.id || account.__ID, ...account };
  console.log('currentAccount set to:', currentAccount);

  document.getElementById('accountUsername').value = account.username || '';
  document.getElementById('accountFirstName').value = account.firstName || '';
  document.getElementById('accountLastName').value = account.lastName || '';
  setRoles(account.role);
  updateSupervisorFields(account);
  document.getElementById('accountStatus').value = account.status || 'Active';
  document.getElementById('accountStaffId').value = account.staffId || '';
  document.getElementById('accountPayrollId').value = account.payrollId || '';
  document.getElementById('accountPhone').value = account.phone || '';
  document.getElementById('accountCredentials').value = account.credentials || '';

  console.log('Form fields populated');

  // Show delete button only for existing accounts
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) deleteAccountBtn.style.display = currentAccount.id ? '' : 'none';

  // Hide the badge when viewing an existing account
  const badge = document.getElementById('accountStatusBadge');
  if (badge) badge.style.display = 'none';

  const detailsCard = document.querySelector('#accountsPage .details-card');
  console.log('detailsCard element:', detailsCard);
  if (detailsCard) {
    console.log('Showing details card');
    console.log('Before: detailsCard.style.display =', detailsCard.style.display);
    console.log('Before: computed style =', window.getComputedStyle(detailsCard).display);
    detailsCard.style.display = '';
    console.log('After: detailsCard.style.display =', detailsCard.style.display);
    console.log('After: computed style =', window.getComputedStyle(detailsCard).display);
  }
  
  // Also check main-content
  const mainContent = document.querySelector('#accountsPage .main-content');
  console.log('mainContent element:', mainContent);
  if (mainContent) {
    console.log('mainContent computed style:', window.getComputedStyle(mainContent).display);
  }

  checkAccountForChanges();
}

// Load a specific account into the form
function loadAccountDetails(account) {
  console.log('loadAccountDetails called with:', account);
  if (!account) {
    console.log('Account is null/undefined, returning');
    return;
  }

  // Track record-to-record navigation so Back can restore the previous account
  const incomingId = account.id || account.__ID;
  if (currentAccount && (currentAccount.id || currentAccount.__ID) !== incomingId) {
    previousAccount = { ...currentAccount };
  }

  // Populate form first with available data
  _populateAccountForm(account);

  // Call FileMaker script to handle account selection and fetch full details
  if (window.FileMaker) {
    console.log('Calling FileMaker script for account selection');
    const accountId = account.id || account.__ID;
    window.FileMaker.PerformScript('Manage: UserAccount', JSON.stringify({ 
      mode: 'get', 
      id: accountId 
    }));
  }
}

// Check for unsaved changes in the account form
function checkAccountForChanges() {
  const username = document.getElementById('accountUsername').value.trim();
  const firstName = document.getElementById('accountFirstName').value.trim();
  const lastName = document.getElementById('accountLastName').value.trim();
  const role = getRoles();
  const status = document.getElementById('accountStatus').value;
  const staffId = document.getElementById('accountStaffId').value.trim();
  const payrollId = document.getElementById('accountPayrollId').value.trim();
  const phone = document.getElementById('accountPhone').value.trim();
  const credentials = document.getElementById('accountCredentials').value.trim();
  const cotaSupervisorId = document.getElementById('cotaSupervisorSelect').value || '';
  const cfSupervisorId = document.getElementById('cfSupervisorSelect').value || '';

  const hasData = username || firstName || lastName || role.length > 0;
  const savedRoles = Array.isArray(currentAccount?.role) ? currentAccount.role : (currentAccount?.role ? [currentAccount.role] : []);
  const rolesChanged = role.length !== savedRoles.length || role.some(r => !savedRoles.includes(r));
  const hasChanges = currentAccount
    ? (username !== (currentAccount.username || '') ||
       firstName !== (currentAccount.firstName || '') ||
       lastName !== (currentAccount.lastName || '') ||
       rolesChanged ||
       status !== (currentAccount.status || 'Active') ||
       staffId !== (currentAccount.staffId || '') ||
       payrollId !== (currentAccount.payrollId || '') ||
       phone !== (currentAccount.phone || '') ||
       credentials !== (currentAccount.credentials || '') ||
       cotaSupervisorId !== (currentAccount.cotaSupervisorId || '') ||
       cfSupervisorId !== (currentAccount.cfSupervisorId || ''))
    : hasData;

  if (hasChanges) {
    const savebar = document.getElementById('savebar');
    const saveBtn = document.getElementById('saveBtn');
    savebar.style.display = '';
    saveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    saveBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
    const textNode = saveBtn.childNodes[2];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = currentAccount ? ' Save Account' : ' Save New Account';
    }
    saveBtn.onclick = handleAccountSave;
  } else {
    document.getElementById('savebar').style.display = 'none';
  }
}

// Reset the account form to New Account state
function handleNewAccount() {
  currentAccount = null;
  document.getElementById('accountUsername').value = '';
  document.getElementById('accountFirstName').value = '';
  document.getElementById('accountLastName').value = '';
  clearRoles();
  updateSupervisorFields(null);
  document.getElementById('accountStatus').value = 'Active';
  document.getElementById('accountStaffId').value = '';
  document.getElementById('accountPayrollId').value = '';
  document.getElementById('accountPhone').value = '';
  document.getElementById('accountCredentials').value = '';
  document.getElementById('savebar').style.display = 'none';

  const badge = document.getElementById('accountStatusBadge');
  if (badge) {
    badge.textContent = 'New Account';
    badge.style.background = '#e0f2fe';
    badge.style.color = '#0369a1';
    badge.style.display = '';
  }

  const detailsCard = document.querySelector('#accountsPage .details-card');
  if (detailsCard) detailsCard.style.display = '';
}

// Save account to FileMaker
function handleAccountSave() {
  const username = document.getElementById('accountUsername').value.trim();
  const firstName = document.getElementById('accountFirstName').value.trim();
  const lastName = document.getElementById('accountLastName').value.trim();
  const role = getRoles();
  const status = document.getElementById('accountStatus').value;
  const staffId = document.getElementById('accountStaffId').value.trim();
  const payrollId = document.getElementById('accountPayrollId').value.trim();
  const phone = document.getElementById('accountPhone').value.trim();
  const credentials = document.getElementById('accountCredentials').value.trim();
  const cotaSupervisorId = document.getElementById('cotaSupervisorSelect').value || '';
  const cfSupervisorId = document.getElementById('cfSupervisorSelect').value || '';

  if (!username || !firstName || !lastName) {
    showModal('Please enter a username, first name, and last name');
    return;
  }

  const existingId = currentAccount?.id || null;
  const payload = {
    mode: 'save',
    id: existingId,
    username,
    firstName,
    lastName,
    role,
    status,
    staffId,
    payrollId,
    phone,
    credentials,
    cotaSupervisorId,
    cfSupervisorId,
    ...(existingId == null && { newId: crypto.randomUUID() })
  };

  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: UserAccount', JSON.stringify(payload));
  }

  if (currentAccount) {
    Object.assign(currentAccount, { username, firstName, lastName, role, status, staffId, payrollId, phone, credentials, cotaSupervisorId, cfSupervisorId });
    // Also update the entry in allAccounts so navigating away and back reflects the saved data
    const idx = allAccounts.findIndex(a => (a.id || a.__ID) === currentAccount.id);
    if (idx !== -1) Object.assign(allAccounts[idx], { username, firstName, lastName, role, status, staffId, payrollId, phone, credentials, cotaSupervisorId, cfSupervisorId });
  } else {
    // New account — append to list
    const newAccount = { id: null, username, firstName, lastName, role, status, staffId, payrollId, phone, credentials, cotaSupervisorId, cfSupervisorId };
    allAccounts.push(newAccount);
    currentAccount = newAccount;
    renderAccounts(allAccounts);
  }

  // Update the matching list item in place (for existing accounts)
  if (currentAccount && currentAccount.id !== null) {
    const list = document.getElementById('accountsList');
    if (list) {
      list.querySelectorAll('.account-item').forEach(el => {
        const usernameEl = el.querySelector('.account-item-username');
        if (usernameEl && usernameEl.textContent.trim() === payload.username) {
          const nameEl = el.querySelector('.account-item-name');
          if (nameEl) nameEl.textContent = `${firstName} ${lastName}`;
          usernameEl.textContent = username;
          const roleLabel = role === 'ServiceCoordinator' ? 'Service Coordinator' : role;
          const badgesEl = el.querySelector('.account-item-badges');
          if (badgesEl) {
            badgesEl.innerHTML = `
              ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
              ${status ? `<span class="${status === 'Active' ? 'status-badge-active' : 'status-badge-inactive'}">${status}</span>` : ''}
            `;
          }
        }
      });
    }
  }

  checkAccountForChanges();

  if (!window.FileMaker) {
    showModal('Account saved successfully');
  }
}

// Cancel client edits — restore inputs from currentChild
function handleCancelClient() {
  if (currentChild) {
    document.getElementById('firstName').value = currentChild.firstName || '';
    document.getElementById('lastName').value = currentChild.lastName || '';
    document.getElementById('clientId').value = currentChild.clientId || '';
    document.getElementById('county').value = currentChild.county || '';
    setServiceCoordinatorValues(
      currentChild.serviceCoordinatorFirstName,
      currentChild.serviceCoordinatorLastName,
      currentChild.serviceCoordinator || ''
    );
    document.getElementById('interventionistNotes').value = currentChild.interventionistNotes || '';
    currentReminders = [...(currentChild.reminders || [])];
    displayReminders();
    currentClientUsers = JSON.parse(JSON.stringify(currentChild.clientUser || []));
    displayClientUsers();
  }
  checkForChanges();
}

// Cancel account edits — restore inputs from currentAccount
function handleCancelAccount() {
  if (currentAccount) {
    document.getElementById('accountUsername').value = currentAccount.username || '';
    document.getElementById('accountFirstName').value = currentAccount.firstName || '';
    document.getElementById('accountLastName').value = currentAccount.lastName || '';
    setRoles(currentAccount.role);
    updateSupervisorFields(currentAccount);
    document.getElementById('accountStatus').value = currentAccount.status || 'Active';
    document.getElementById('accountStaffId').value = currentAccount.staffId || '';
    document.getElementById('accountPayrollId').value = currentAccount.payrollId || '';
    document.getElementById('accountPhone').value = currentAccount.phone || '';
    document.getElementById('accountCredentials').value = currentAccount.credentials || '';
  }
  checkAccountForChanges();
}

// Show a confirm modal; calls onConfirm() if user clicks Delete
function showConfirmModal(message, onConfirm) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmModalMessage').textContent = message;
  modal.style.display = 'flex';

  const okBtn = document.getElementById('confirmModalOkBtn');
  const cancelBtn = document.getElementById('confirmModalCancelBtn');

  function close() {
    modal.style.display = 'none';
    okBtn.removeEventListener('click', handleOk);
    cancelBtn.removeEventListener('click', close);
    modal.removeEventListener('click', handleBackdrop);
  }
  function handleOk() { close(); onConfirm(); }
  function handleBackdrop(e) { if (e.target === modal) close(); }

  okBtn.addEventListener('click', handleOk);
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', handleBackdrop);
}

// Delete current client
function handleDeleteClient() {
  if (!currentChild?.id) return;
  showConfirmModal(
    `Delete ${currentChild.firstName} ${currentChild.lastName}? This cannot be undone.`,
    () => {
      if (window.FileMaker) {
        window.FileMaker.PerformScript('Manage: Client', JSON.stringify({ mode: 'delete', id: currentChild.id }));
      } else {
        console.log('FileMaker not available - deleting client:', currentChild.id);
      }
      currentChild = null;
      document.getElementById('mainContent').style.display = 'none';
      document.getElementById('savebar').style.display = 'none';
      switchPage('dashboard');
    }
  );
}

// Delete current user account
function handleDeleteAccount() {
  if (!currentAccount?.id) return;
  showConfirmModal(
    `Delete ${currentAccount.firstName} ${currentAccount.lastName}? This cannot be undone.`,
    () => {
      if (window.FileMaker) {
        window.FileMaker.PerformScript('Manage: UserAccount', JSON.stringify({ mode: 'delete', id: currentAccount.id }));
      } else {
        console.log('FileMaker not available - deleting account:', currentAccount.id);
      }
      // Remove from local array and re-render list
      allAccounts = allAccounts.filter(a => (a.id || a.__ID) !== currentAccount.id);
      renderAccounts(allAccounts);
      // Hide the details panel and savebar, clear state
      const detailsCard = document.querySelector('#accountsPage .details-card');
      if (detailsCard) detailsCard.style.display = 'none';
      document.getElementById('savebar').style.display = 'none';
      currentAccount = null;
    }
  );
}

// Load dashboard - called by FileMaker with recent notes data
function loadDashboard(data) {
  let notes = data;
  if (typeof data === 'string') {
    try {
      notes = JSON.parse(data);
    } catch (e) {
      console.error('loadDashboard: failed to parse data', e);
      return;
    }
  }

  if (!Array.isArray(notes)) {
    console.error('loadDashboard: expected an array of notes');
    return;
  }

  const list = document.getElementById('dashboardNotesList');
  if (!list) return;

  if (notes.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="10" y="8" width="28" height="32" rx="2" stroke="currentColor" stroke-width="2"/>
          <line x1="16" y1="16" x2="32" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="16" y1="22" x2="28" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <line x1="16" y1="28" x2="32" y2="28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No recent notes</p>
      </div>`;
  } else {
    list.innerHTML = notes.map(note => {
      const clientName = `${note.clientFirstName || ''} ${note.clientLastName || ''}`.trim();
      const providerName = `${note.eIFirstName || ''} ${note.eILastName || ''}`.trim();
      const credentials = note.eICredentials ? ` &middot; ${note.eICredentials}` : '';
      const date = formatDisplayDate(note.date || note.noteDate || note.createdAt || '');
      const noteText = note.note || '';
      const noteId = note.id || '';
      return `
        <div class="note-item dashboard-note-item">
          <div class="note-header">
            <span class="dashboard-note-client">${clientName}</span>
            <span class="note-date">${date}</span>
          </div>
          <div class="dashboard-note-provider">${providerName}${credentials}</div>
          ${noteText ? `<div class="note-content">${noteText}</div>` : ''}
          <div class="dashboard-note-actions">
            <button class="btn-note-action" data-mode="viewClientDashboard" data-id="${noteId}">View Client</button>
            <button class="btn-note-action btn-note-action--secondary" data-mode="viewSessionNoteDashboard" data-id="${noteId}">View Session Note</button>
          </div>
        </div>`;
    }).join('');
  }

  switchPage('dashboard');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-note-action');
    if (!btn) return;
    const mode = btn.dataset.mode;
    const id = btn.dataset.id;
    if (window.FileMaker) {
      window.FileMaker.PerformScript('Manage: Client', JSON.stringify({ mode, id }));
    }
  });
}

// Load client list - alternative dashboard for roles that show a client roster
function loadClientList(data) {
  let clients = data;
  if (typeof data === 'string') {
    try {
      clients = JSON.parse(data);
    } catch (e) {
      console.error('loadClientList: failed to parse data', e);
      return;
    }
  }

  if (!Array.isArray(clients)) {
    console.error('loadClientList: expected an array of clients');
    return;
  }

  const sorted = [...clients].sort((a, b) => {
    const last = (a.lastName || '').trim().localeCompare((b.lastName || '').trim());
    if (last !== 0) return last;
    return (a.firstName || '').trim().localeCompare((b.firstName || '').trim());
  });

  const cardHeader = document.querySelector('.dashboard-notes-card .card-header h2');
  if (cardHeader) {
    cardHeader.innerHTML = `
      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:6px">
        <circle cx="8" cy="5" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Clients`;
  }

  const list = document.getElementById('dashboardNotesList');
  if (!list) return;

  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="18" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M8 42c0-8.837 7.163-14 16-14s16 5.163 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>No clients found</p>
      </div>`;
  } else {
    list.innerHTML = `<div class="client-list-grid">${
      sorted.map(client => {
        const lastName = (client.lastName || '').trim();
        const firstName = (client.firstName || '').trim();
        const id = client.__ID || '';
        const rid = client.rid || '';
        return `<button class="client-list-item" data-id="${id}" data-rid="${rid}">${lastName}, ${firstName}</button>`;
      }).join('')
    }</div>`;

    list.querySelector('.client-list-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.client-list-item');
      if (!btn) return;
      if (window.FileMaker) {
        window.FileMaker.PerformScript('Manage: Client', JSON.stringify({ mode: 'selectClient', id: btn.dataset.id, rid: btn.dataset.rid }));
      }
    });
  }

  switchPage('dashboard');
}

// Expose accounts functions to FileMaker
window.renderAccounts = renderAccounts;
window.loadAccountDetails = loadAccountDetails;
window.renderAccountDetails = renderAccountDetails;

// Allow FileMaker to set the user list independently of renderInterface
function setUserList(users) {
  if (typeof users === 'string') {
    try { users = JSON.parse(users); } catch (e) { return; }
  }
  let list = users;
  if (users && users.value && Array.isArray(users.value)) list = users.value;
  if (Array.isArray(list)) {
    currentUserList = list;
    // Re-render if client users are already displayed
    if (currentClientUsers.length > 0) displayClientUsers();
  }
}

// Expose functions to window for FileMaker to call
window.renderInterface = renderInterface;
window.setUserList = setUserList;
window.loadChild = loadChild;
window.displaySearchResults = displaySearchResults;
window.updateClientId = updateClientId;
window.loadDashboard = loadDashboard;
window.loadClientList = loadClientList;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  initInterface();
  const maxAttempts = 20;
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (window.FileMaker) {
      clearInterval(interval);
      window.FileMaker.PerformScript('Manage: Client', JSON.stringify({ mode: 'loadDashboard' }));
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      // Dev mode: FileMaker not found — dismiss loading screen and show clients page
      switchPage('clients');
    }
  }, 100);
});