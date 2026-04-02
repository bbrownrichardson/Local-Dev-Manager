// ── Project Modal, Clone, Scaffold & Profiles ────────────────────
(function () {
  const S = App.state;
  const { esc } = App.utils;

  const emojiList = [
    '🚀','💻','🌐','🔥','⚡','🎨','🛠️','📦','🧪','🐍',
    '🐳','☕','💎','🎯','📡','🔒','🤖','📊','🎮','💬',
    '🛒','📱','🗄️','🧠','⭐','🔔','🌙','☁️','🍃','❤️'
  ];

  const tplCmds = {
    'vite-react': 'npm run dev',
    'nextjs': 'npm run dev',
    'node': 'node index.js',
    'python': 'python3 main.py',
    'go': 'go run .'
  };

  /* ── Command rows ───────────────────────────────────────────── */

  function renderCommandRows() {
    const container = document.getElementById('cmd-rows');
    if (!container) return;
    let html = '';
    S.modalCommands.forEach(function (cmd, i) {
      html += '<div class="cmd-row" data-index="' + i + '">'
        + '<input type="text" class="cmd-label" placeholder="Label" value="' + esc(cmd.label || '') + '" />'
        + '<input type="text" class="cmd-cmd" placeholder="Command" value="' + esc(cmd.cmd || '') + '" />'
        + '<input type="text" class="cmd-cwd" placeholder="Working dir" value="' + esc(cmd.cwd || '') + '" />'
        + '<button class="btn-remove-cmd" data-index="' + i + '">✕</button>'
        + '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.cmd-row').forEach(function (row) {
      const idx = parseInt(row.getAttribute('data-index'), 10);
      row.querySelector('.cmd-label').addEventListener('input', function (e) {
        S.modalCommands[idx].label = e.target.value;
      });
      row.querySelector('.cmd-cmd').addEventListener('input', function (e) {
        S.modalCommands[idx].cmd = e.target.value;
      });
      row.querySelector('.cmd-cwd').addEventListener('input', function (e) {
        S.modalCommands[idx].cwd = e.target.value;
      });
      row.querySelector('.btn-remove-cmd').addEventListener('click', function () {
        S.modalCommands.splice(idx, 1);
        renderCommandRows();
      });
    });
  }

  /* ── Open / Close / Save ────────────────────────────────────── */

  function openModal(project) {
    if (!project) project = null;
    const modal = document.getElementById('modal');
    S.editingId = project ? project.id : null;

    document.getElementById('input-name').value = project ? project.name : '';
    document.getElementById('input-path').value = project ? project.path : '';
    document.getElementById('input-command').value = project ? project.command : '';
    document.getElementById('input-url').value = project ? (project.url || '') : '';
    document.getElementById('input-icon').value = project ? (project.icon || '') : '';
    document.getElementById('input-env').value = project ? (project.envVars || '') : '';

    const gitName = document.getElementById('input-git-name');
    const gitEmail = document.getElementById('input-git-email');
    if (gitName) gitName.value = project && project.gitIdentity ? project.gitIdentity.name : '';
    if (gitEmail) gitEmail.value = project && project.gitIdentity ? project.gitIdentity.email : '';

    S.selectedColor = project ? (project.color || '') : '';
    S.autoRestart = project ? !!project.autoRestart : false;

    var autoBtn = document.getElementById('toggle-autorestart');
    if (autoBtn) {
      autoBtn.classList.toggle('active', S.autoRestart);
    }

    document.querySelectorAll('.color-swatch').forEach(function (sw) {
      sw.classList.toggle('selected', sw.getAttribute('data-color') === S.selectedColor);
    });

    S.modalCommands = project && project.commands ? project.commands.map(function (c) {
      return { label: c.label || '', cmd: c.cmd || '', cwd: c.cwd || '' };
    }) : [];
    renderCommandRows();

    setModalMode('existing');
    modal.style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal').style.display = 'none';
    S.editingId = null;
  }

  function saveModal() {
    var name = document.getElementById('input-name').value.trim();
    var path = document.getElementById('input-path').value.trim();
    if (!name || !path) return;

    var command = document.getElementById('input-command').value.trim();
    var url = document.getElementById('input-url').value.trim();
    var icon = document.getElementById('input-icon').value.trim();
    var envVars = document.getElementById('input-env').value.trim();

    var gitName = '';
    var gitEmail = '';
    var gitNameEl = document.getElementById('input-git-name');
    var gitEmailEl = document.getElementById('input-git-email');
    if (gitNameEl) gitName = gitNameEl.value.trim();
    if (gitEmailEl) gitEmail = gitEmailEl.value.trim();

    var gitIdentity = (gitName || gitEmail) ? { name: gitName, email: gitEmail } : null;

    var projectData = {
      name: name,
      path: path,
      command: command,
      commands: S.modalCommands.filter(function (c) { return c.cmd; }),
      url: url,
      icon: icon,
      color: S.selectedColor,
      autoRestart: S.autoRestart,
      envVars: envVars,
      gitIdentity: gitIdentity
    };

    if (S.editingId) {
      var idx = S.projects.findIndex(function (p) { return p.id === S.editingId; });
      if (idx !== -1) {
        projectData.id = S.editingId;
        projectData.lastStarted = S.projects[idx].lastStarted;
        S.projects[idx] = projectData;
      }
    } else {
      projectData.id = crypto.randomUUID();
      S.projects.push(projectData);
    }

    window.api.saveProjects(S.projects);

    if (gitIdentity && projectData.path) {
      window.api.gitSetIdentity(projectData.path, gitIdentity);
    }

    closeModal();
    App.sidebar.renderSidebar();
    App.sidebar.renderProfiles();
    if (S.selectedId) App.app.renderDetail();
    App.app.refreshGitStatuses();
  }

  /* ── Delete / Clone ─────────────────────────────────────────── */

  function deleteProject(id) {
    var status = S.statuses[id];
    if (status === 'running') {
      window.api.stopProject(id);
    }
    if (S.activeTerminals) {
      Object.keys(S.activeTerminals).forEach(function (key) {
        if (key.startsWith(id)) {
          var at = S.activeTerminals[key];
          if (at && at.term) at.term.dispose();
          delete S.activeTerminals[key];
        }
      });
    }
    delete S.statuses[id];
    delete S.logBuffers[id];
    delete S.gitCache[id];
    delete S.resourceCache[id];

    S.projects = S.projects.filter(function (p) { return p.id !== id; });
    window.api.saveProjects(S.projects);

    if (S.selectedId === id) {
      S.selectedId = S.projects.length ? S.projects[0].id : null;
    }
    App.sidebar.renderSidebar();
    App.sidebar.renderProfiles();
    if (S.selectedId) {
      App.app.selectProject(S.selectedId);
    } else {
      App.app.renderDetail();
    }
  }

  function cloneProject(p) {
    var copy = JSON.parse(JSON.stringify(p));
    copy.id = crypto.randomUUID();
    copy.name = p.name + ' (copy)';
    copy.commands = p.commands ? p.commands.map(function (c) {
      return { label: c.label, cmd: c.cmd, cwd: c.cwd };
    }) : [];
    delete copy.lastStarted;
    S.projects.push(copy);
    window.api.saveProjects(S.projects);
    App.sidebar.renderSidebar();
    App.sidebar.renderProfiles();
    App.app.selectProject(copy.id);
  }

  /* ── Profile modal ──────────────────────────────────────────── */

  function openProfileModal() {
    document.getElementById('profile-name').value = '';
    var list = document.getElementById('profile-project-list');
    var html = '';
    S.projects.forEach(function (p) {
      html += '<label><input type="checkbox" value="' + esc(p.id) + '" /> ' + esc(p.name) + '</label>';
    });
    list.innerHTML = html;
    document.getElementById('profile-modal').style.display = 'flex';
  }

  /* ── Modal mode switching ───────────────────────────────────── */

  function setModalMode(mode) {
    S.currentModalMode = mode;
    document.querySelectorAll('.modal-mode-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === mode);
    });
    var existing = document.getElementById('modal-existing-section');
    var clone = document.getElementById('modal-clone-section');
    var scaffold = document.getElementById('modal-scaffold-section');
    if (existing) existing.style.display = mode === 'existing' ? '' : 'none';
    if (clone) clone.style.display = mode === 'clone' ? '' : 'none';
    if (scaffold) scaffold.style.display = mode === 'scaffold' ? '' : 'none';
  }

  /* ── Event bindings ─────────────────────────────────────────── */

  document.getElementById('btn-add').addEventListener('click', function () {
    openModal();
  });

  document.getElementById('btn-cancel').addEventListener('click', function () {
    closeModal();
  });

  document.getElementById('btn-save').addEventListener('click', function () {
    saveModal();
  });

  document.getElementById('btn-add-cmd').addEventListener('click', function () {
    S.modalCommands.push({ label: '', cmd: '', cwd: '' });
    renderCommandRows();
  });

  /* ── Emoji picker ───────────────────────────────────────────── */

  var emojiDropdown = document.getElementById('emoji-picker-dropdown');
  if (emojiDropdown) {
    var pickerHtml = '';
    emojiList.forEach(function (em) {
      pickerHtml += '<button class="emoji-btn" type="button">' + em + '</button>';
    });
    pickerHtml += '<button class="emoji-btn emoji-clear" type="button">✕</button>';
    emojiDropdown.innerHTML = pickerHtml;
  }

  var inputIcon = document.getElementById('input-icon');
  if (inputIcon) {
    inputIcon.addEventListener('focus', function () {
      inputIcon.select();
    });
  }

  var btnEmojiPicker = document.getElementById('btn-emoji-picker');
  if (btnEmojiPicker) {
    btnEmojiPicker.addEventListener('click', function (e) {
      e.stopPropagation();
      if (emojiDropdown) {
        emojiDropdown.style.display = emojiDropdown.style.display === 'block' ? 'none' : 'block';
      }
    });
  }

  if (emojiDropdown) {
    emojiDropdown.addEventListener('click', function (e) {
      var btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      if (btn.classList.contains('emoji-clear')) {
        if (inputIcon) inputIcon.value = '';
      } else {
        if (inputIcon) inputIcon.value = btn.textContent;
      }
      emojiDropdown.style.display = 'none';
    });
  }

  document.addEventListener('click', function () {
    if (emojiDropdown) emojiDropdown.style.display = 'none';
  });

  /* ── Modal mode tabs ────────────────────────────────────────── */

  document.querySelectorAll('.modal-mode-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      setModalMode(tab.getAttribute('data-mode'));
    });
  });

  /* ── Clone mode ─────────────────────────────────────────────── */

  var btnCancelClone = document.getElementById('btn-cancel-clone');
  if (btnCancelClone) {
    btnCancelClone.addEventListener('click', function () {
      closeModal();
    });
  }

  var btnBrowseClone = document.getElementById('btn-browse-clone');
  if (btnBrowseClone) {
    btnBrowseClone.addEventListener('click', async function () {
      var folder = await window.api.pickFolder();
      if (folder) document.getElementById('clone-dest').value = folder;
    });
  }

  var btnClone = document.getElementById('btn-clone');
  if (btnClone) {
    btnClone.addEventListener('click', async function () {
      var url = document.getElementById('clone-url').value.trim();
      var dest = document.getElementById('clone-dest').value.trim();
      var cmd = document.getElementById('clone-cmd').value.trim();
      if (!url || !dest) return;

      try {
        var result = await window.api.gitClone(url, dest);
        var detected = await window.api.detectProject(result.path || dest);
        var projectData = {
          id: crypto.randomUUID(),
          name: detected && detected.name ? detected.name : url.split('/').pop().replace('.git', ''),
          path: result.path || dest,
          command: cmd || (detected && detected.command ? detected.command : ''),
          commands: [],
          url: '',
          icon: '',
          color: '',
          autoRestart: false,
          envVars: ''
        };
        S.projects.push(projectData);
        window.api.saveProjects(S.projects);
        closeModal();
        App.sidebar.renderSidebar();
        App.sidebar.renderProfiles();
        App.app.selectProject(projectData.id);
      } catch (err) {
        console.error('Clone failed:', err);
      }
    });
  }

  /* ── Scaffold mode ──────────────────────────────────────────── */

  document.querySelectorAll('.scaffold-tpl-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.scaffold-tpl-btn').forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      S.selectedTpl = btn.getAttribute('data-tpl');
    });
  });

  var btnCancelScaffold = document.getElementById('btn-cancel-scaffold');
  if (btnCancelScaffold) {
    btnCancelScaffold.addEventListener('click', function () {
      closeModal();
    });
  }

  var btnBrowseScaffold = document.getElementById('btn-browse-scaffold');
  if (btnBrowseScaffold) {
    btnBrowseScaffold.addEventListener('click', async function () {
      var folder = await window.api.pickFolder();
      if (folder) document.getElementById('scaffold-dest').value = folder;
    });
  }

  var btnScaffold = document.getElementById('btn-scaffold');
  if (btnScaffold) {
    btnScaffold.addEventListener('click', async function () {
      var name = document.getElementById('scaffold-name').value.trim();
      var dest = document.getElementById('scaffold-dest').value.trim();
      var tpl = S.selectedTpl;
      if (!name || !dest || !tpl) return;

      try {
        var result = await window.api.scaffoldProject(tpl, dest, name);
        var projectData = {
          id: crypto.randomUUID(),
          name: name,
          path: result.path || (dest + '/' + name),
          command: tplCmds[tpl] || '',
          commands: [],
          url: '',
          icon: '',
          color: '',
          autoRestart: false,
          envVars: ''
        };
        S.projects.push(projectData);
        window.api.saveProjects(S.projects);
        closeModal();
        App.sidebar.renderSidebar();
        App.sidebar.renderProfiles();
        App.app.selectProject(projectData.id);
      } catch (err) {
        console.error('Scaffold failed:', err);
      }
    });
  }

  /* ── Auto-restart toggle ────────────────────────────────────── */

  var toggleAutoRestart = document.getElementById('toggle-autorestart');
  if (toggleAutoRestart) {
    toggleAutoRestart.addEventListener('click', function () {
      S.autoRestart = !S.autoRestart;
      toggleAutoRestart.classList.toggle('active', S.autoRestart);
    });
  }

  /* ── Color swatches ─────────────────────────────────────────── */

  document.querySelectorAll('.color-swatch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      S.selectedColor = sw.getAttribute('data-color');
      document.querySelectorAll('.color-swatch').forEach(function (s) {
        s.classList.toggle('selected', s.getAttribute('data-color') === S.selectedColor);
      });
    });
  });

  /* ── Browse folder ──────────────────────────────────────────── */

  var btnBrowse = document.getElementById('btn-browse');
  if (btnBrowse) {
    btnBrowse.addEventListener('click', async function () {
      var folder = await window.api.pickFolder();
      if (folder) {
        document.getElementById('input-path').value = folder;
        var detected = await window.api.detectProject(folder);
        if (detected) {
          if (detected.name && !document.getElementById('input-name').value) {
            document.getElementById('input-name').value = detected.name;
          }
          if (detected.command && !document.getElementById('input-command').value) {
            document.getElementById('input-command').value = detected.command;
          }
        }
      }
    });
  }

  /* ── Profile modal events ───────────────────────────────────── */

  var profileCancel = document.getElementById('profile-cancel');
  if (profileCancel) {
    profileCancel.addEventListener('click', function () {
      document.getElementById('profile-modal').style.display = 'none';
    });
  }

  var profileSave = document.getElementById('profile-save');
  if (profileSave) {
    profileSave.addEventListener('click', async function () {
      var name = document.getElementById('profile-name').value.trim();
      if (!name) return;
      var checked = document.querySelectorAll('#profile-project-list input:checked');
      var ids = [];
      checked.forEach(function (cb) { ids.push(cb.value); });
      if (!ids.length) return;

      var profile = { id: crypto.randomUUID(), name: name, projectIds: ids };
      S.profiles.push(profile);
      await window.api.saveProfiles(S.profiles);
      document.getElementById('profile-modal').style.display = 'none';
      App.sidebar.renderProfiles();
    });
  }

  /* ── Exports ────────────────────────────────────────────────── */

  App.modal = {
    openModal: openModal,
    closeModal: closeModal,
    saveModal: saveModal,
    deleteProject: deleteProject,
    cloneProject: cloneProject,
    openProfileModal: openProfileModal,
    renderCommandRows: renderCommandRows,
    setModalMode: setModalMode
  };
})();
