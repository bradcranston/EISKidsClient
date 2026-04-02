// Global state
let currentChild = null;
let currentAccount = null;
let children = [];
let sessionNotes = [];

// Page switching
function switchPage(page) {
  const clientsPage = document.getElementById('clientsPage');
  const accountsPage = document.getElementById('accountsPage');
  const tabs = document.querySelectorAll('.page-nav-tab');

  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === page);
  });

  if (page === 'clients') {
    clientsPage.style.display = '';
    accountsPage.style.display = 'none';
  } else if (page === 'accounts') {
    clientsPage.style.display = 'none';
    accountsPage.style.display = '';
    loadAccounts();
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
  const addNoteBtn = document.getElementById('addNoteBtn');
  const sessionNotesList = document.getElementById('sessionNotesList');
  const modalClose = document.querySelector('.modal-close');
  const modalOkBtn = document.getElementById('modalOkBtn');

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
  searchFirstName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  searchLastName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  saveBtn.addEventListener('click', handleSave);
  clearBtn.addEventListener('click', handleClear);
  addNoteBtn.addEventListener('click', handleAddNote);

  // Track changes in form fields
  firstName.addEventListener('input', checkForChanges);
  lastName.addEventListener('input', checkForChanges);

  console.log('EIS Kids Client initialized');

  // Wire up page nav tabs
  document.querySelectorAll('.page-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPage(tab.dataset.page));
  });

  // Initialize in "New Client" state
  initializeNewClientState();
  initAccountsPage();
}

// Initialize interface to New Client state
function initializeNewClientState() {
  // Clear the form
  document.getElementById('firstName').value = '';
  document.getElementById('lastName').value = '';
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
  document.getElementById('addNoteBtn').disabled = true;
  
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'New Client';
    statusBadge.style.background = '#e0f2fe';
    statusBadge.style.color = '#0369a1';
  }
  
  // Hide save button
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
  
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
  const saveBtn = document.getElementById('saveBtn');
  
  // Check if there are changes compared to current child data
  const hasChanges = currentChild ? 
    (firstName !== currentChild.firstName || lastName !== currentChild.lastName) :
    (firstName !== '' || lastName !== '');
  
  if (hasChanges) {
    // Show button and turn it green for unsaved changes
    saveBtn.style.display = '';
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
    saveBtn.style.display = 'none';
  }
}

// Handle save child
function handleSave() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();

  if (!firstName || !lastName) {
    showModal('Please enter both first and last name');
    return;
  }

  const childData = {
    mode: 'save',
    id: currentChild?.id || null,
    firstName: firstName,
    lastName: lastName
  };

  // Call FileMaker script to save
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify(childData));
    
    // Update current child data to reflect saved state
    if (currentChild) {
      currentChild.firstName = firstName;
      currentChild.lastName = lastName;
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
  document.getElementById('addNoteBtn').disabled = true;
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'New Client';
    statusBadge.style.background = '#e0f2fe';
    statusBadge.style.color = '#0369a1';
  }
  
  // Reset save button color
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
  
  currentChild = null;
}

// Handle add note
function handleAddNote() {
  if (!currentChild) {
    showModal('Please select a client first');
    return;
  }

  // Call FileMaker script to add note
  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: Client', JSON.stringify({
      mode: 'addNote',
      childId: currentChild.id
    }));
  } else {
    console.log('FileMaker not available - adding note for client:', currentChild.id);
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
    console.log('FileMaker not available - loading client:', childId);
    // For testing
    renderInterface({
      id: childId,
      firstName: 'John',
      lastName: 'Doe',
      sessionNotes: [
        { id: '1', date: '2026-02-01', note: 'First session - child engaged well' },
        { id: '2', date: '2026-02-08', note: 'Continued progress with verbal skills' }
      ]
    });
  }
}

// Main render function - called from FileMaker
function renderInterface(data) {
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

  // Handle OData format - extract first client from value array
  if (data && data.value && Array.isArray(data.value) && data.value.length > 0) {
    console.log('OData format detected, extracting first client from value array');
    data = data.value[0];
  }

  // Update current child - support both __ID and id
  currentChild = {
    id: data.id || data.__ID,
    firstName: data.firstName,
    lastName: data.lastName
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
    console.log('Form fields populated successfully');
  } else {
    console.error('Form fields not found!');
  }

  // Update status badge
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'Editing';
    statusBadge.style.background = '#dbeafe';
    statusBadge.style.color = '#1e40af';
  }

  // Enable add note button
  const addNoteBtn = document.getElementById('addNoteBtn');
  if (addNoteBtn) {
    addNoteBtn.disabled = false;
  }

  // Display session notes
  try {
    displaySessionNotes(data.sessionNotes || data.notes || []);
  } catch (error) {
    console.error('Failed to display session notes:', error);
    displaySessionNotes([]);
  }

  
  // Check for changes to show/hide save button
  checkForChanges();
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
  
  if (!notes || notes.length === 0) {
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
  notes.forEach((note, index) => {
    const noteDate = note.date || note.noteDate || note.createdAt || '';
    const noteText = note.note || note.text || note.sessionNote || '';

    html += `
      <div class="note-item" data-note-index="${index}">
        <div class="note-header">
          <span class="note-date">${noteDate}</span>
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
      const selectedNote = Number.isNaN(noteIndex) ? null : notes[noteIndex];
      if (!selectedNote) {
        console.error('Unable to resolve clicked session note');
        return;
      }
      handleViewSessionNote(selectedNote);
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
  
  // Update current child with the new ID
  currentChild = {
    id: id,
    firstName: firstName,
    lastName: lastName
  };
  
  console.log('Client ID updated:', id);
  
  // Update status badge to show we're now editing an existing client
  const statusBadge = document.getElementById('statusBadge');
  if (statusBadge) {
    statusBadge.textContent = 'Editing';
    statusBadge.style.background = '#dbeafe';
    statusBadge.style.color = '#1e40af';
  }
  
  // Enable add note button now that we have a client ID
  document.getElementById('addNoteBtn').disabled = false;
  
  // Hide save button since we just saved
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
  
  console.log('Interface updated with client ID:', currentChild);
}

// ===== User Accounts Page =====

// Initialize accounts page event listeners
function initAccountsPage() {
  const saveAccountBtn = document.getElementById('saveAccountBtn');
  const newAccountBtn = document.getElementById('newAccountBtn');
  const accountUsername = document.getElementById('accountUsername');
  const accountFirstName = document.getElementById('accountFirstName');
  const accountLastName = document.getElementById('accountLastName');
  const accountRole = document.getElementById('accountRole');
  const accountStatus = document.getElementById('accountStatus');

  newAccountBtn.addEventListener('click', handleNewAccount);
  saveAccountBtn.addEventListener('click', handleAccountSave);

  accountUsername.addEventListener('input', checkAccountForChanges);
  accountFirstName.addEventListener('input', checkAccountForChanges);
  accountLastName.addEventListener('input', checkAccountForChanges);
  accountRole.addEventListener('change', checkAccountForChanges);
  accountStatus.addEventListener('change', checkAccountForChanges);
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
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse accounts data:', e);
      return;
    }
  }

  let accounts = data;
  if (data && data.value && Array.isArray(data.value)) {
    accounts = data.value;
  }
  if (!Array.isArray(accounts)) {
    accounts = [];
  }

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
    const statusClass = account.status === 'Active' ? 'status-badge-active' : 'status-badge-inactive';
    const roleLabel = account.role === 'ServiceCoordinator' ? 'Service Coordinator' : (account.role || '');
    html += `
      <div class="account-item" data-account-index="${index}">
        <div class="account-item-avatar">${initials.toUpperCase()}</div>
        <div class="account-item-info">
          <div class="account-item-name">${account.firstName || ''} ${account.lastName || ''}</div>
          <div class="account-item-username">@${account.username || ''}</div>
        </div>
        <div class="account-item-badges">
          ${roleLabel ? `<span class="role-badge">${roleLabel}</span>` : ''}
          <span class="${statusClass}">${account.status || ''}</span>
        </div>
      </div>
    `;
  });

  accountsList.innerHTML = html;

  // Attach click listeners after rendering
  const renderedItems = accountsList.querySelectorAll('.account-item[data-account-index]');
  renderedItems.forEach(item => {
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.accountIndex);
      if (!Number.isNaN(idx)) loadAccountDetails(accounts[idx]);
    });
  });
}

// Load a specific account into the form
function loadAccountDetails(account) {
  if (!account) return;

  currentAccount = { id: account.id || account.__ID, ...account };

  document.getElementById('accountUsername').value = account.username || '';
  document.getElementById('accountFirstName').value = account.firstName || '';
  document.getElementById('accountLastName').value = account.lastName || '';
  document.getElementById('accountRole').value = account.role || '';
  document.getElementById('accountStatus').value = account.status || 'Active';

  const badge = document.getElementById('accountStatusBadge');
  if (badge) {
    badge.textContent = 'Editing';
    badge.style.background = '#dbeafe';
    badge.style.color = '#1e40af';
  }

  checkAccountForChanges();
}

// Check for unsaved changes in the account form
function checkAccountForChanges() {
  const username = document.getElementById('accountUsername').value.trim();
  const firstName = document.getElementById('accountFirstName').value.trim();
  const lastName = document.getElementById('accountLastName').value.trim();
  const role = document.getElementById('accountRole').value;
  const status = document.getElementById('accountStatus').value;
  const saveAccountBtn = document.getElementById('saveAccountBtn');

  const hasData = username || firstName || lastName || role;
  const hasChanges = currentAccount
    ? (username !== (currentAccount.username || '') ||
       firstName !== (currentAccount.firstName || '') ||
       lastName !== (currentAccount.lastName || '') ||
       role !== (currentAccount.role || '') ||
       status !== (currentAccount.status || 'Active'))
    : hasData;

  if (hasChanges) {
    saveAccountBtn.style.display = '';
    saveAccountBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    saveAccountBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
    const textNode = saveAccountBtn.childNodes[2];
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = currentAccount ? ' Save Account' : ' Save New Account';
    }
  } else {
    saveAccountBtn.style.display = 'none';
  }
}

// Reset the account form to New Account state
function handleNewAccount() {
  currentAccount = null;
  document.getElementById('accountUsername').value = '';
  document.getElementById('accountFirstName').value = '';
  document.getElementById('accountLastName').value = '';
  document.getElementById('accountRole').value = '';
  document.getElementById('accountStatus').value = 'Active';
  document.getElementById('saveAccountBtn').style.display = 'none';

  const badge = document.getElementById('accountStatusBadge');
  if (badge) {
    badge.textContent = 'New Account';
    badge.style.background = '#e0f2fe';
    badge.style.color = '#0369a1';
  }
}

// Save account to FileMaker
function handleAccountSave() {
  const username = document.getElementById('accountUsername').value.trim();
  const firstName = document.getElementById('accountFirstName').value.trim();
  const lastName = document.getElementById('accountLastName').value.trim();
  const role = document.getElementById('accountRole').value;
  const status = document.getElementById('accountStatus').value;

  if (!username || !firstName || !lastName) {
    showModal('Please enter a username, first name, and last name');
    return;
  }

  const payload = {
    mode: 'save',
    id: currentAccount?.id || null,
    username,
    firstName,
    lastName,
    role,
    status
  };

  if (window.FileMaker) {
    window.FileMaker.PerformScript('Manage: UserAccount', JSON.stringify(payload));
    if (currentAccount) {
      Object.assign(currentAccount, { username, firstName, lastName, role, status });
    }
    checkAccountForChanges();
  } else {
    console.log('FileMaker not available - saving account:', payload);
    showModal('Account saved successfully');
  }
}

// Expose accounts functions to FileMaker
window.renderAccounts = renderAccounts;
window.loadAccountDetails = loadAccountDetails;

// Expose functions to window for FileMaker to call
window.renderInterface = renderInterface;
window.loadChild = loadChild;
window.displaySearchResults = displaySearchResults;
window.updateClientId = updateClientId;

// Initialize on load
document.addEventListener('DOMContentLoaded', initInterface);