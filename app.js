/**
 * KING OF GAKURAN - 15 VS 15 TOURNAMENT
 * Interactive Web Application Engine
 */

// One-time data clear migration flag: reset all data as requested by user
if (!localStorage.getItem("gaku_cleared_all_v3")) {
  localStorage.setItem("gaku_tournament_teams", JSON.stringify([]));
  localStorage.setItem("gaku_tournament_matches", JSON.stringify([]));
  localStorage.setItem("gaku_audit_logs", JSON.stringify([]));
  localStorage.removeItem("gaku_playoff_matches");
  localStorage.removeItem("gaku_current_server_owner");
  localStorage.setItem("gaku_cleared_all_v3", "true");
}

// Initial Seed Data (Empty by default - real registered teams appear)
const DEFAULT_TEAMS = [];

// App State
class TournamentApp {
constructor() {
    // 1. ค่าเริ่มต้นเป็นค่าว่างก่อน เพื่อรอโหลดจาก Supabase กลาง
    this.teams = [];
    this.matches = [];
    this.auditLogs = [
      {
        id: "log-init-1",
        timestamp: "19:42:00",
        date: new Date().toISOString().split("T")[0],
        actor: "System",
        action: "INIT",
        details: "ระบบ King of Gakuran Tournament พร้อมทำงาน"
      }
    ];
    this.playoffMatches = [];
    this.currentServerOwner = null;

    this.currentFilter = "all";
    this.searchQuery = "";
    this.selectedTeam = null;
    this.isReferee = false;
    this.refereeName = "";
    this.currentAdminTab = "dashboard";
    this.mcState = null;
    this.countdownTimer = null;
    this.isMatchPaused = false;

    // 2. เรียกโหลดข้อมูลจาก Supabase กลางทันทีที่เปิดเว็บ
    this.initSupabaseData();

    try { this.bindEvents(); } catch(e) { console.error('[bindEvents]', e); }
    try { this.initRegisterForm(); } catch(e) { console.error('[initRegisterForm]', e); }
  }

  // ฟังก์ชันดึงข้อมูลทั้งหมดจาก Supabase กลาง
  async initSupabaseData() {
    try {
      console.log("Loading data from Supabase...");

      if (typeof supabase !== 'undefined' && supabase) {
        // 1. โหลด Teams จาก Supabase
        const { data: teamRows, error: teamErr } = await supabase.from('teams').select('*');
        if (!teamErr && teamRows && teamRows.length > 0) {
          this.teams = teamRows.map(row => row.data || row);
        } else {
          try {
            const localTeams = localStorage.getItem("gaku_tournament_teams");
            if (localTeams) this.teams = JSON.parse(localTeams);
          } catch(e) {}
        }

        // 2. โหลด Matches จาก Supabase
        const { data: matchRows, error: matchErr } = await supabase.from('matches').select('*');
        if (!matchErr && matchRows && matchRows.length > 0) {
          this.matches = matchRows.map(row => row.data || row);
        } else {
          try {
            const localMatches = localStorage.getItem("gaku_tournament_matches");
            if (localMatches) this.matches = JSON.parse(localMatches);
          } catch(e) {}
        }

        // 3. โหลด Playoff Matches จาก Supabase
        const { data: playoffRows, error: playoffErr } = await supabase.from('playoff_matches').select('*');
        if (!playoffErr && playoffRows && playoffRows.length > 0) {
          this.playoffMatches = playoffRows.map(row => row.data || row);
        } else {
          try {
            const localPlayoff = localStorage.getItem("gaku_playoff_matches");
            this.playoffMatches = localPlayoff ? JSON.parse(localPlayoff) : this.generateDefaultPlayoffBracket();
          } catch(e) {
            this.playoffMatches = this.generateDefaultPlayoffBracket();
          }
        }

        // 4. โหลด Audit Logs จาก Supabase
        const { data: logRows, error: logErr } = await supabase.from('audit_logs').select('*');
        if (!logErr && logRows && logRows.length > 0) {
          this.auditLogs = logRows.map(row => row.data || row);
        } else {
          try {
            const localLogs = localStorage.getItem("gaku_audit_logs");
            if (localLogs) this.auditLogs = JSON.parse(localLogs);
          } catch(e) {}
        }
      }

      // เรนเดอร์หน้าจอใหม่หลังจากได้ข้อมูลกลางทั้งหมดแล้ว
      this.selectedTeam = this.teams[0] || null;
      try { this.computeRankings(); } catch(e) { console.error('[computeRankings]', e); }
      try { this.renderTeams(); } catch(e) { console.error('[renderTeams]', e); }
      try { this.renderRankings(); } catch(e) { console.error('[renderRankings]', e); }
      try { this.renderMatches(); } catch(e) { console.error('[renderMatches]', e); }
      try { this.renderPlayers(); } catch(e) { console.error('[renderPlayers]', e); }
      try { this.renderPlayoffBracket(); } catch(e) { console.error('[renderPlayoffBracket]', e); }
      try { this.populateMatchControlSelects(); } catch(e) { console.error('[populateMatchControlSelects]', e); }
      try { this.populateServerCompareSelects(); } catch(e) { console.error('[populateServerCompareSelects]', e); }
      try { this.renderServerOwnerPortal(); } catch(e) { console.error('[renderServerOwnerPortal]', e); }
      try { this.renderAuditLogs(); } catch(e) { console.error('[renderAuditLogs]', e); }

      console.log("Supabase data loaded successfully!");
    } catch (e) {
      console.error("Error loading from Supabase:", e);
    }
  }

  loadTeams() {
    // ใช้ค่าจากหน่วยความจำกลางที่ซิงค์กับ Supabase แล้ว
    return this.teams || [];
  }

  async saveTeams() {
    // บันทึกทีมทั้งหมดลง Supabase กลาง (รองรับตาราง id + data jsonb)
    try {
      if (typeof supabase !== 'undefined' && supabase) {
        for (const team of this.teams) {
          const teamId = team.id || team.name || `team-${Date.now()}`;
          await supabase.from('teams').upsert({
            id: teamId,
            data: team
          });
        }
        console.log("Teams saved to Supabase successfully.");
      }
    } catch (e) {
      console.error("Failed to save teams to Supabase:", e);
      // สำรองข้อมูลลง localStorage เผื่อเน็ตหลุด
      localStorage.setItem("gaku_tournament_teams", JSON.stringify(this.teams));
    }
  }

  loadAuditLogs() {
    return this.auditLogs || [];
  }

  async saveAuditLogs() {
    // บันทึก Audit Logs ลง Supabase กลาง
    try {
      if (typeof supabase !== 'undefined' && supabase) {
        const latestLog = this.auditLogs && this.auditLogs[0];
        if (latestLog) {
          await supabase.from('audit_logs').upsert({
            id: latestLog.id || `log-${Date.now()}`,
            data: latestLog
          });
        }
      }
    } catch (e) {
      console.error("Failed to save audit logs to Supabase:", e);
      localStorage.setItem("gaku_audit_logs", JSON.stringify(this.auditLogs));
    }
  }

  addAuditLog(actor, action, details) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toISOString().split('T')[0];
    const who = actor || (this.isReferee ? `Referee (${this.refereeName || 'Official'})` : 'Admin');
    const newLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: timeStr,
      date: dateStr,
      actor: who,
      action: action,
      details: details
    };
    this.auditLogs.unshift(newLog);
    if (this.auditLogs.length > 200) this.auditLogs.pop();
    this.saveAuditLogs();
    this.renderAuditLogs();

    // Live update mc-log if match control is visible
    const mcLog = document.getElementById("mc-log");
    if (mcLog) {
      const entry = `<div style="padding: 4px 0; border-bottom: 1px dashed #eee;"><strong>[${timeStr}]</strong> <span style="color:var(--color-brand); font-weight:700;">${who}</span>: ${details}</div>`;
      if (mcLog.innerHTML.includes("— Match audit log will appear here —")) {
        mcLog.innerHTML = entry;
      } else {
        mcLog.innerHTML = entry + mcLog.innerHTML;
      }
    }
  }

  clearAuditLogs() {
    if (!confirm("ต้องการล้างประวัติ Audit Log ทั้งหมดหรือไม่?")) return;
    this.auditLogs = [];
    this.saveAuditLogs();
    this.renderAuditLogs();
  }

  clearAllTournamentData(skipConfirm = false) {
    if (!skipConfirm && !confirm("⚠️ คุณแน่ใจหรือไม่ว่าต้องการเคลียร์ข้อมูลทั้งหมด?\n\n- ประวัติระบบ (Audit Logs & Match History)\n- รายชื่อทีม / เซิร์ฟเวอร์ (Teams / Servers)\n- แมตช์การแข่งขัน (Matches)\n- รายชื่อผู้เล่น (Players / Rosters)\n- สายการแข่งขัน Playoff (Bracket)")) {
      return;
    }

    // 1. Reset in-memory state
    this.teams = [];
    this.matches = [];
    this.auditLogs = [];
    this.mcState = null;
    this.selectedTeam = null;
    this.currentServerOwner = null;

    // 2. Reset Playoff matches to clean TBD
    this.playoffMatches = this.generateDefaultPlayoffBracket();

    // 3. Persist to localStorage
    localStorage.setItem("gaku_tournament_teams", JSON.stringify([]));
    localStorage.setItem("gaku_tournament_matches", JSON.stringify([]));
    localStorage.setItem("gaku_audit_logs", JSON.stringify([]));
    localStorage.setItem("gaku_playoff_matches", JSON.stringify(this.playoffMatches));
    localStorage.removeItem("gaku_current_server_owner");

    // Add initial log
    this.addAuditLog("System", "RESET_ALL", "เคลียร์ประวัติ รายชื่อทีม MATCH PLAYER PLAYOFF เรียบร้อยแล้ว (เริ่มต้นระบบใหม่)");

    // 4. Re-render all views
    try { this.computeRankings(); } catch(e) { console.error(e); }
    try { this.renderTeams(); } catch(e) { console.error(e); }
    try { this.renderRankings(); } catch(e) { console.error(e); }
    try { this.renderMatches(); } catch(e) { console.error(e); }
    try { this.renderPlayers(); } catch(e) { console.error(e); }
    try { this.renderPlayoffBracket(); } catch(e) { console.error(e); }
    try { this.populateMatchControlSelects(); } catch(e) { console.error(e); }
    try { this.populateServerCompareSelects(); } catch(e) { console.error(e); }
    try { this.renderServerOwnerPortal(); } catch(e) { console.error(e); }
    try { if (this.currentAdminTab) this.renderCurrentAdminTab(); } catch(e) { console.error(e); }

    // Reset Match Control scoreboard if open
    const sb = document.getElementById("mc-scoreboard");
    if (sb) sb.style.display = "none";
    const resBanner = document.getElementById("mc-result-banner");
    if (resBanner) resBanner.style.display = "none";

    alert("✅ เคลียร์ประวัติ, รายชื่อทีม, แมตช์ (Match), ผู้เล่น (Player), และ Playoff เรียบร้อยแล้ว!");
  }

  /**
   * RANKING ENGINE (ONLINE GROUP STAGE / ระบบเก็บแต้มออนไลน์)
   * Ranking ดึงและคำนวณจาก Completed Matches โดยอัตโนมัติ
   * สูตรคะแนนทางการ: ชนะ 2-0 ได้ +3 PTS | ชนะ 2-1 ได้ +2 PTS | แพ้ได้ 0 PTS
   * 4 อันดับแรกได้ไปสายบน (Upper Bracket) · 4 อันดับล่างลงมาได้ไปสายล่าง (Lower Bracket)
   */
  computeRankings() {
    if (!this.teams || this.teams.length === 0) return [];

    // Reset statistics for all teams
    this.teams.forEach(team => {
      team.stats = {
        played: 0,
        won: 0,
        lost: 0,
        win20: 0, // wins 2-0 (+3 PTS)
        win21: 0, // wins 2-1 (+2 PTS)
        roundWon: 0,
        roundLost: 0,
        points: 0
      };
    });

    // Aggregate from all completed matches (regular online matches)
    const completedMatches = (this.matches || []).filter(m => m.status === "COMPLETED");

    completedMatches.forEach(match => {
      const teamA = this.teams.find(t => t.id === match.serverAId || t.name === match.serverAName);
      const teamB = this.teams.find(t => t.id === match.serverBId || t.name === match.serverBName);

      const scoreA = Number(match.scoreA) || 0;
      const scoreB = Number(match.scoreB) || 0;
      const isAWin = match.winner === match.serverAId || match.winner === match.serverAName || (scoreA > scoreB);
      const isBWin = match.winner === match.serverBId || match.winner === match.serverBName || (scoreB > scoreA);

      if (teamA) {
        teamA.stats.played += 1;
        teamA.stats.roundWon += scoreA;
        teamA.stats.roundLost += scoreB;
        if (isAWin) {
          teamA.stats.won += 1;
          // ชนะ 2-0 ได้ +3 PTS, ชนะ 2-1 ได้ +2 PTS
          if (scoreB === 0) {
            teamA.stats.win20 += 1;
            teamA.stats.points += 3;
          } else {
            teamA.stats.win21 += 1;
            teamA.stats.points += 2;
          }
        } else {
          teamA.stats.lost += 1;
        }
      }

      if (teamB) {
        teamB.stats.played += 1;
        teamB.stats.roundWon += scoreB;
        teamB.stats.roundLost += scoreA;
        if (isBWin) {
          teamB.stats.won += 1;
          // ชนะ 2-0 ได้ +3 PTS, ชนะ 2-1 ได้ +2 PTS
          if (scoreA === 0) {
            teamB.stats.win20 += 1;
            teamB.stats.points += 3;
          } else {
            teamB.stats.win21 += 1;
            teamB.stats.points += 2;
          }
        } else {
          teamB.stats.lost += 1;
        }
      }
    });

    // Save updated team statistics
    this.saveTeams();

    // Sort: 1. Points (DESC) -> 2. Match Won (DESC) -> 3. Round Differential (tiebreaker) -> 4. Name (ASC)
    return [...this.teams].sort((a, b) => {
      if ((b.stats.points || 0) !== (a.stats.points || 0)) {
        return (b.stats.points || 0) - (a.stats.points || 0);
      }
      if ((b.stats.won || 0) !== (a.stats.won || 0)) {
        return (b.stats.won || 0) - (a.stats.won || 0);
      }
      const diffA = (a.stats.roundWon || 0) - (a.stats.roundLost || 0);
      const diffB = (b.stats.roundWon || 0) - (b.stats.roundLost || 0);
      if (diffB !== diffA) return diffB - diffA;
      return (a.name || "").localeCompare(b.name || "");
    });
  }

  initRouter() {
    const handleRoute = () => {
      let hash = window.location.hash || "#home";
      let [route, param] = hash.split("?");

      document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
        if (link.getAttribute("href") === route) {
          link.classList.add("active");
        }
      });

      // Special check for team profile
      if (route.startsWith("#team/")) {
        const teamId = route.replace("#team/", "");
        const team = this.teams.find(t => t.id === teamId) || null;
        this.renderTeamProfile(team);
        this.showView("view-team-profile");
        return;
      }

      // Special check for player profile
      if (route.startsWith("#player/")) {
        const playerId = route.replace("#player/", "");
        this.renderPlayerProfile(playerId);
        this.showView("view-player-profile");
        return;
      }

      switch (route) {
        case "#home":
          this.showView("view-home");
          break;
        case "#tournament":
          this.showView("view-tournament");
          break;
        case "#teams":
          this.showView("view-teams");
          this.renderTeams();
          break;
        case "#players":
          this.showView("view-players");
          this.renderPlayers();
          break;
        case "#matches":
          this.showView("view-matches");
          this.renderMatches();
          break;
        case "#live":
          this.showView("view-live");
          break;
        case "#ranking":
          this.showView("view-ranking");
          this.renderRankings();
          break;
        case "#rules":
          this.showView("view-rules");
          break;
        case "#register":
          this.showView("view-register");
          break;
        case "#admin":
          this.showView("view-admin");
          this.initAdminPanel();
          break;
        case "#match-control":
          this.showView("view-match-control");
          break;
        default:
          this.showView("view-home");
      }
      window.scrollTo(0, 0);
    };

    window.addEventListener("hashchange", handleRoute);

    // Also bind nav-link clicks directly (belt + suspenders approach)
    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", (e) => {
        // Let the hash change happen, then call handleRoute
        setTimeout(() => handleRoute(), 10);
      });
    });

    handleRoute();
  }

  showView(viewId) {
    document.querySelectorAll(".view-section").forEach(view => {
      view.classList.remove("active");
    });
    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add("active");
    }
  }

  bindEvents() {
    // Referee login form submit
    const loginForm = document.getElementById('referee-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('referee-name').value.trim();
        const pass = document.getElementById('referee-pass').value.trim();
        if (pass === '15454') {
          this.isReferee = true;
          this.refereeName = name || 'Referee';
          document.getElementById('referee-login').style.display = 'none';
          document.getElementById('match-control-dashboard').style.display = 'block';
          const welcome = document.getElementById('referee-welcome');
          if (welcome) welcome.textContent = `ยินดีต้อนรับ ${this.refereeName}`;
          this.populateMatchControlSelects();
          this.addAuditLog(`Referee (${this.refereeName})`, 'LOGIN', 'เข้าสู่ระบบ Match Control');
        } else {
          const err = document.getElementById('referee-login-error');
          if (err) err.style.display = 'block';
        }
      });
    }

    // Referee logout
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'referee-logout-btn') {
        this.addAuditLog(`Referee (${this.refereeName || 'Official'})`, 'LOGOUT', 'ออกจากระบบ Match Control');
        this.isReferee = false;
        this.refereeName = '';
        document.getElementById('match-control-dashboard').style.display = 'none';
        document.getElementById('referee-login').style.display = 'flex';
        document.getElementById('referee-pass').value = '';
        const err = document.getElementById('referee-login-error');
        if (err) err.style.display = 'none';
      }
    });

    // Load existing match button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-load-match-btn') {
        const sel = document.getElementById('mc-existing-match-select');
        if (sel && sel.value) {
          this.loadMatchIntoControl(sel.value);
        } else {
          alert('กรุณาเลือกแมตช์จากรายการที่ต้องการโหลด');
        }
      }
    });

    // Start / Restart match control button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-start-match-btn') {
        const selA = document.getElementById('mc-team-a');
        const selB = document.getElementById('mc-team-b');
        if (!selA || !selB || !selA.value || !selB.value) {
          alert('กรุณาเลือกเซิร์ฟเวอร์ A และเซิร์ฟเวอร์ B');
          return;
        }
        if (selA.value === selB.value) {
          alert('กรุณาเลือกเซิร์ฟเวอร์ที่แตกต่างกัน');
          return;
        }
        this.initNewMatchControlSession(selA.value, selB.value);
      }
    });

    // Player Eliminate / Revive toggle button (delegated)
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.mc-player-toggle-btn');
      if (toggleBtn && this.mcState) {
        const side = toggleBtn.dataset.side; // 'a' or 'b'
        const idx = parseInt(toggleBtn.dataset.idx);
        this.togglePlayerElimination(side, idx);
      }
    });

    // Reset Roster All Alive buttons
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-reset-roster-a') {
        this.resetRosterAlive('a');
      }
      if (e.target && e.target.id === 'mc-reset-roster-b') {
        this.resetRosterAlive('b');
      }
    });

    // Round win buttons (delegated)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.mc-win-btn');
      if (btn && this.mcState) {
        const round = parseInt(btn.dataset.round);
        const winner = btn.dataset.winner; // 'a' or 'b'
        this.recordRoundWin(round, winner);
      }
    });

    // Confirm Round Suggestion button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-apply-suggest-btn' && this.mcState) {
        if (this.mcState.suggestedWinner) {
          this.recordRoundWin(this.mcState.currentRound, this.mcState.suggestedWinner);
        }
      }
    });

    // CONFIRM RESULT & UPDATE RANKING button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-confirm-result-btn') {
        this.confirmMatchResult();
      }
    });

    // New match reset button
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-new-match-btn') {
        this.resetMatchControl();
      }
    });

    // Re-seed Playoff button
    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'btn-reseed-playoff' || e.target.closest('#btn-reseed-playoff'))) {
        this.generatePlayoffBracketFromSeeding();
      }
      // Reset All Data button
      if (e.target && (e.target.id === 'admin-reset-all-btn' || e.target.closest('#admin-reset-all-btn'))) {
        this.clearAllTournamentData();
      }
      // Direct load from bracket card to Match Control
      const bracketMatchBtn = e.target.closest('.btn-load-bracket-match');
      if (bracketMatchBtn) {
        const matchId = bracketMatchBtn.dataset.matchid;
        if (matchId) {
          setTimeout(() => {
            this.loadMatchIntoControl(matchId);
          }, 50);
        }
      }
    });

    // Countdown and Pause controls
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mc-trigger-countdown-btn') {
        this.startCountdown(10);
      }
      if (e.target && e.target.id === 'mc-cancel-countdown-btn') {
        this.cancelCountdown();
      }
      if (e.target && e.target.id === 'mc-toggle-pause-btn') {
        this.toggleMatchPause();
      }
    });

    // Server Owner Login & Actions
    const ownerLoginForm = document.getElementById('owner-login-form');
    if (ownerLoginForm) {
      ownerLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const srvSelect = document.getElementById('owner-login-server-select');
        const codeInput = document.getElementById('owner-login-code');
        const err = document.getElementById('owner-login-error');
        if (!srvSelect || !codeInput) return;
        const ok = this.handleServerOwnerLogin(srvSelect.value, codeInput.value);
        if (!ok) {
          if (err) err.style.display = 'block';
        } else {
          if (err) err.style.display = 'none';
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'owner-logout-btn') {
        this.handleServerOwnerLogout();
      }
      if (e.target && e.target.id === 'owner-regen-code-btn') {
        this.regenerateServerCode();
      }
      if (e.target && e.target.id === 'owner-checkin-all-btn') {
        this.checkinAllStarters();
      }
      if (e.target && e.target.id === 'owner-mark-read-btn') {
        this.markAllNotifsRead();
      }
      const checkinBtn = e.target.closest('.owner-player-checkin-btn');
      if (checkinBtn) {
        const starterId = checkinBtn.dataset.player;
        this.toggleStarterCheckin(starterId);
      }
    });

    const subForm = document.getElementById('owner-sub-form');
    if (subForm) {
      subForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const starterSel = document.getElementById('owner-sub-starter-select');
        const subSel = document.getElementById('owner-sub-sub-select');
        const reasonInput = document.getElementById('owner-sub-reason');
        if (starterSel && subSel && reasonInput) {
          this.emergencySubstitute(starterSel.value, subSel.value, reasonInput.value);
          reasonInput.value = '';
        }
      });
    }

    const disputeForm = document.getElementById('owner-dispute-form');
    if (disputeForm) {
      disputeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const subj = document.getElementById('owner-dispute-subject');
        const desc = document.getElementById('owner-dispute-desc');
        const ev = document.getElementById('owner-dispute-evidence');
        if (subj && desc) {
          this.handleDisputeSubmit(subj.value, desc.value, ev ? ev.value : '');
          desc.value = '';
          if (ev) ev.value = '';
        }
      });
    }

    // Compare selects change
    const cmpA = document.getElementById('compare-select-a');
    const cmpB = document.getElementById('compare-select-b');
    if (cmpA) cmpA.addEventListener('change', () => this.renderServerCompare());
    if (cmpB) cmpB.addEventListener('change', () => this.renderServerCompare());

    // Team Filters
    document.querySelectorAll('.filter-pill[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.getAttribute('data-filter');
        this.renderTeams();
      });
    });

    // Team Search
    const searchInput = document.getElementById('teams-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTeams();
      });
    }

    // Mobile nav
    const mobileToggle = document.querySelector('.mobile-nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (mobileToggle && navMenu) {
      mobileToggle.addEventListener('click', () => {
        navMenu.style.display = navMenu.style.display === 'flex' ? 'none' : 'flex';
      });
    }
  }

  // ============================================================
  // MATCH CONTROL ENGINE (Referee System)
  // ============================================================

  populateMatchControlSelects() {
    // Populate Existing Matches Select (Regular + Double Elimination Playoff)
    const matchSelect = document.getElementById('mc-existing-match-select');
    if (matchSelect) {
      let options = '<option value="">-- โหลดแมตช์จากระบบ --</option>';
      if (this.playoffMatches && this.playoffMatches.length > 0) {
        const grandFinal = this.playoffMatches.filter(p => p.bracketType === 'GRAND_FINAL' || p.id === 'PLAYOFF-GRAND-FINAL' || p.round === 'GRAND FINAL');
        const upperMatches = this.playoffMatches.filter(p => p.bracketType === 'UPPER' || p.id.includes('-UB-'));
        const lowerMatches = this.playoffMatches.filter(p => p.bracketType === 'LOWER' || p.id.includes('-LB-'));

        if (grandFinal.length > 0) {
          options += '<optgroup label="🏆 รอบชิงชนะเลิศ (Grand Final: แชมป์สายบน VS แชมป์สายล่าง)">';
          grandFinal.forEach(p => {
            options += `<option value="${p.id}">[${p.round}] ${p.id}: ${p.serverAName || p.sourceA || 'TBD'} VS ${p.serverBName || p.sourceB || 'TBD'} (${p.status})</option>`;
          });
          options += '</optgroup>';
        }

        if (upperMatches.length > 0) {
          options += '<optgroup label="🔷 สายบน (Upper Bracket - ชนะไปต่อ / แพ้ตกสายล่าง)">';
          upperMatches.forEach(p => {
            options += `<option value="${p.id}">[${p.round}] ${p.id}: ${p.serverAName || p.sourceA || 'TBD'} VS ${p.serverBName || p.sourceB || 'TBD'} (${p.status})</option>`;
          });
          options += '</optgroup>';
        }

        if (lowerMatches.length > 0) {
          options += '<optgroup label="🔶 สายล่าง (Lower Bracket - โอกาสแก้ตัว / ทีมสุดท้ายกลับขึ้นสายบน)">';
          lowerMatches.forEach(p => {
            options += `<option value="${p.id}">[${p.round}] ${p.id}: ${p.serverAName || p.sourceA || 'TBD'} VS ${p.serverBName || p.sourceB || 'TBD'} (${p.status})</option>`;
          });
          options += '</optgroup>';
        }
      }
      if (this.matches && this.matches.length > 0) {
        options += '<optgroup label="แมตช์ทั่วไป / รอบคัดเลือก">';
        this.matches.forEach(m => {
          options += `<option value="${m.id}">${m.id}: ${m.serverAName} VS ${m.serverBName} (${m.status})</option>`;
        });
        options += '</optgroup>';
      }
      matchSelect.innerHTML = options;
    }

    // Populate Team Selects
    const selA = document.getElementById('mc-team-a');
    const selB = document.getElementById('mc-team-b');
    if (selA && selB) {
      const opts = '<option value="">-- เลือกทีม --</option>' +
        this.teams.map(t => `<option value="${t.id}">${t.name} (${t.server || 'Server'})</option>`).join('');
      selA.innerHTML = opts;
      selB.innerHTML = opts;
    }
  }

  loadMatchIntoControl(matchId) {
    let match = (this.matches || []).find(m => m.id === matchId);
    let isPlayoff = false;
    if (!match && this.playoffMatches) {
      match = this.playoffMatches.find(m => m.id === matchId);
      isPlayoff = !!match;
    }
    if (!match) return;

    const teamA = this.teams.find(t => t.id === match.serverAId || t.name === match.serverAName);
    const teamB = this.teams.find(t => t.id === match.serverBId || t.name === match.serverBName);

    if (!teamA || !teamB) {
      alert(`แมตช์ ${match.id} ยังไม่พร้อมสำหรับ Match Control เนื่องจากคู่แข่งยังไม่ครบถ้วน (TBD):\n${match.serverAName || match.sourceA || 'TBD'} VS ${match.serverBName || match.sourceB || 'TBD'}`);
      return;
    }

    // Set Team Selects
    const selA = document.getElementById('mc-team-a');
    const selB = document.getElementById('mc-team-b');
    if (selA) selA.value = teamA.id;
    if (selB) selB.value = teamB.id;

    if (match.status !== 'COMPLETED') {
      match.status = 'LIVE';
      if (isPlayoff) this.savePlayoffMatches(); else this.saveMatches();
    }

    this.initMatchControlState(match, teamA, teamB);
    this.addAuditLog(null, 'LOAD_MATCH', `โหลดแมตช์ ${match.id} (${teamA.name} VS ${teamB.name}) เข้าสู่ Match Control`);
  }

  initNewMatchControlSession(teamAId, teamBId) {
    const teamA = this.teams.find(t => t.id === teamAId);
    const teamB = this.teams.find(t => t.id === teamBId);
    if (!teamA || !teamB) return;

    // Check if match already exists or create new
    let match = this.matches.find(m => 
      (m.serverAId === teamA.id && m.serverBId === teamB.id) ||
      (m.serverAId === teamB.id && m.serverBId === teamA.id)
    );

    if (!match) {
      match = {
        id: `MATCH-${String(this.matches.length + 1).padStart(3, '0')}`,
        serverAId: teamA.id,
        serverBId: teamB.id,
        serverAName: teamA.name,
        serverBName: teamB.name,
        status: 'LIVE',
        scoreA: 0,
        scoreB: 0,
        winner: null,
        rounds: [
          { number: 1, type: '15 VS 15', winner: null, status: 'IN PROGRESS' },
          { number: 2, type: '15 VS 15', winner: null, status: 'WAITING' },
          { number: 3, type: '15 VS 15 (DECISIVE)', winner: null, status: 'NOT PLAYED' }
        ]
      };
      this.matches.unshift(match);
      this.saveMatches();
      this.addAuditLog('Admin', 'CREATE_MATCH', `สร้างแมตช์ใหม่ ${match.id}: ${teamA.name} VS ${teamB.name}`);
    } else {
      match.status = 'LIVE';
      this.saveMatches();
    }

    this.initMatchControlState(match, teamA, teamB);
  }

  initMatchControlState(match, teamA, teamB) {
    // Generate default 15 players if not present
    const startersA = (teamA.starters && teamA.starters.length >= 15) ? teamA.starters.slice(0, 15) :
      Array.from({ length: 15 }, (_, i) => `${teamA.name}_P${String(i+1).padStart(2, '0')}`);

    const startersB = (teamB.starters && teamB.starters.length >= 15) ? teamB.starters.slice(0, 15) :
      Array.from({ length: 15 }, (_, i) => `${teamB.name}_P${String(i+1).padStart(2, '0')}`);

    this.mcState = {
      matchId: match.id,
      teamAId: teamA.id,
      teamBId: teamB.id,
      nameA: teamA.name,
      nameB: teamB.name,
      scoreA: match.scoreA || 0,
      scoreB: match.scoreB || 0,
      currentRound: 1,
      winners: [],
      playersA: startersA.map((name, i) => ({ num: String(i+1).padStart(2, '0'), name, status: 'ALIVE' })),
      playersB: startersB.map((name, i) => ({ num: String(i+1).padStart(2, '0'), name, status: 'ALIVE' })),
      suggestedWinner: null,
      isConcluded: false
    };

    // UI Updates
    const sb = document.getElementById('mc-scoreboard');
    if (sb) sb.style.display = 'block';

    document.getElementById('mc-name-a').textContent = this.mcState.nameA;
    document.getElementById('mc-name-b').textContent = this.mcState.nameB;
    document.getElementById('mc-score-a').textContent = this.mcState.scoreA;
    document.getElementById('mc-score-b').textContent = this.mcState.scoreB;
    document.getElementById('mc-result-banner').style.display = 'none';

    const titleA = document.getElementById('mc-roster-title-a');
    const titleB = document.getElementById('mc-roster-title-b');
    if (titleA) titleA.textContent = `${this.mcState.nameA} ROSTER (15 STARTERS)`;
    if (titleB) titleB.textContent = `${this.mcState.nameB} ROSTER (15 STARTERS)`;

    // Reset rounds UI
    ['mc-round1','mc-round2','mc-round3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) { el.style.opacity = i === 0 ? '1' : '0.4'; el.style.pointerEvents = i === 0 ? 'auto' : 'none'; }
    });
    document.getElementById('mc-r1-status').textContent = 'IN PROGRESS';
    document.getElementById('mc-r2-status').textContent = 'WAITING';
    document.getElementById('mc-r3-status').textContent = 'NOT PLAYED';
    document.getElementById('mc-status-badge').textContent = 'ROUND 1 — IN PROGRESS';
    document.getElementById('mc-status-badge').style.background = 'var(--color-brand)';

    this.renderRosterChips('a');
    this.renderRosterChips('b');
    this.updateAliveBadges();
  }

  renderRosterChips(side) {
    const listEl = document.getElementById(side === 'a' ? 'mc-roster-players-a' : 'mc-roster-players-b');
    if (!listEl || !this.mcState) return;

    const players = side === 'a' ? this.mcState.playersA : this.mcState.playersB;

    listEl.innerHTML = players.map((p, idx) => {
      const isElim = p.status === 'ELIMINATED';
      return `
        <div class="roster-player-chip ${isElim ? 'eliminated' : ''}">
          <span class="player-num">${p.num}</span>
          <span class="player-name">${p.name}</span>
          <button class="btn btn-outline mc-player-toggle-btn" data-side="${side}" data-idx="${idx}" style="padding: 4px 10px; font-size: 0.72rem; ${isElim ? 'color: var(--color-success); border-color: var(--color-success);' : 'color: #DC2626; border-color: #FCA5A5;'}">
            ${isElim ? 'REVIVE ↺' : 'ELIMINATE ✕'}
          </button>
        </div>
      `;
    }).join('');
  }

  togglePlayerElimination(side, idx) {
    const s = this.mcState;
    if (!s) return;

    const players = side === 'a' ? s.playersA : s.playersB;
    const player = players[idx];
    if (!player) return;

    const teamName = side === 'a' ? s.nameA : s.nameB;
    const oldStatus = player.status;
    player.status = oldStatus === 'ALIVE' ? 'ELIMINATED' : 'ALIVE';

    this.renderRosterChips(side);
    this.updateAliveBadges();

    // Log Action
    this.addAuditLog(null, 'PLAYER_STATUS', `${s.matchId}: [${teamName}] ${player.num} ${player.name} → ${player.status}`);

    // Check if one team reaches 0 ALIVE
    this.checkRoundAliveStatus();
  }

  resetRosterAlive(side) {
    if (!this.mcState) return;
    const players = side === 'a' ? this.mcState.playersA : this.mcState.playersB;
    players.forEach(p => p.status = 'ALIVE');
    this.renderRosterChips(side);
    this.updateAliveBadges();
    const banner = document.getElementById('mc-round-suggest-banner');
    if (banner) banner.style.display = 'none';
  }

  updateAliveBadges() {
    const s = this.mcState;
    if (!s) return;

    const aliveA = s.playersA.filter(p => p.status === 'ALIVE').length;
    const aliveB = s.playersB.filter(p => p.status === 'ALIVE').length;

    const badgeA = document.getElementById('mc-alive-a-badge');
    const badgeB = document.getElementById('mc-alive-b-badge');

    if (badgeA) {
      badgeA.textContent = `${aliveA} ALIVE`;
      badgeA.style.color = aliveA === 0 ? '#DC2626' : '#16a34a';
    }
    if (badgeB) {
      badgeB.textContent = `${aliveB} ALIVE`;
      badgeB.style.color = aliveB === 0 ? '#DC2626' : '#16a34a';
    }
  }

  checkRoundAliveStatus() {
    const s = this.mcState;
    if (!s || s.isConcluded) return;

    const aliveA = s.playersA.filter(p => p.status === 'ALIVE').length;
    const aliveB = s.playersB.filter(p => p.status === 'ALIVE').length;

    const banner = document.getElementById('mc-round-suggest-banner');
    const suggestText = document.getElementById('mc-suggest-text');

    if (aliveA === 0 && aliveB > 0) {
      s.suggestedWinner = 'b';
      if (banner && suggestText) {
        suggestText.innerHTML = `⚠️ <strong>${s.nameA}</strong> เหลือ 0 ALIVE! (ผู้รอดชีวิต: ${s.nameB} ${aliveB} ALIVE)<br>ระบบเสนอผู้ชนะรอบ: <strong>${s.nameB}</strong>`;
        banner.style.display = 'block';
      }
    } else if (aliveB === 0 && aliveA > 0) {
      s.suggestedWinner = 'a';
      if (banner && suggestText) {
        suggestText.innerHTML = `⚠️ <strong>${s.nameB}</strong> เหลือ 0 ALIVE! (ผู้รอดชีวิต: ${s.nameA} ${aliveA} ALIVE)<br>ระบบเสนอผู้ชนะรอบ: <strong>${s.nameA}</strong>`;
        banner.style.display = 'block';
      }
    } else {
      s.suggestedWinner = null;
      if (banner) banner.style.display = 'none';
    }
  }

  recordRoundWin(round, winner) {
    const s = this.mcState;
    if (!s || s.isConcluded) return;

    s.winners[round - 1] = winner;
    if (winner === 'a') s.scoreA++; else s.scoreB++;

    document.getElementById('mc-score-a').textContent = s.scoreA;
    document.getElementById('mc-score-b').textContent = s.scoreB;

    const winnerName = winner === 'a' ? s.nameA : s.nameB;
    const roundEl = document.getElementById(`mc-round${round}`);
    if (roundEl) { roundEl.style.opacity = '0.6'; roundEl.style.pointerEvents = 'none'; }
    document.getElementById(`mc-r${round}-status`).textContent = `✅ ${winnerName}`;

    // Hide suggestion banner
    const banner = document.getElementById('mc-round-suggest-banner');
    if (banner) banner.style.display = 'none';

    // Log to Audit Trail
    this.addAuditLog(null, 'ROUND_WIN', `${s.matchId}: ROUND ${round} → ${winnerName} WIN`);

    // Reset rosters for the next round
    this.resetRosterAlive('a');
    this.resetRosterAlive('b');

    // Rule Progression
    if (round === 1) {
      s.currentRound = 2;
      const r2 = document.getElementById('mc-round2');
      if (r2) { r2.style.opacity = '1'; r2.style.pointerEvents = 'auto'; }
      document.getElementById('mc-r2-status').textContent = 'IN PROGRESS';
      document.getElementById('mc-status-badge').textContent = 'ROUND 2 — 1V1 SURVIVAL IN PROGRESS';
      document.getElementById('mc-current-round-tag').textContent = 'ROUND 2: 1V1 SURVIVAL';
    } else if (round === 2) {
      if (s.scoreA === 2 || s.scoreB === 2) {
        // ABSOLUTE WIN 2-0: ห้ามเปิด Round 3 ตามกฎ!
        s.isConcluded = true;
        const finalWinner = s.scoreA === 2 ? s.nameA : s.nameB;
        document.getElementById('mc-r3-status').textContent = 'NOT PLAYED (ABSOLUTE WIN)';
        document.getElementById('mc-current-round-tag').textContent = 'MATCH FINISHED';
        const absBanner = document.getElementById('mc-absolute-win-banner');
        if (absBanner) absBanner.style.display = 'block';
        this.showMatchResult('ABSOLUTE WIN (2-0)', finalWinner);
      } else {
        // 1-1 TIE: เปิด ROUND 3 (15 VS 15)
        s.currentRound = 3;
        const r3 = document.getElementById('mc-round3');
        if (r3) { r3.style.opacity = '1'; r3.style.pointerEvents = 'auto'; }
        document.getElementById('mc-r3-status').textContent = 'IN PROGRESS — 15 VS 15';
        document.getElementById('mc-status-badge').textContent = 'ROUND 3 — 15 VS 15 DECISIVE';
        document.getElementById('mc-status-badge').style.background = '#7c3aed';
        document.getElementById('mc-current-round-tag').textContent = 'ROUND 3 (15v15 DECISIVE)';
        const absBanner = document.getElementById('mc-absolute-win-banner');
        if (absBanner) absBanner.style.display = 'none';
        this.addAuditLog(null, 'ROUND_3_ENABLED', `${s.matchId}: คะแนน 1–1 → เปิด ROUND 3 (15 VS 15 DECISIVE)`);
      }
    } else if (round === 3) {
      // Round 3 Complete
      s.isConcluded = true;
      document.getElementById('mc-current-round-tag').textContent = 'MATCH FINISHED';
      this.showMatchResult('DECISIVE MATCH WINNER (2-1)', winnerName);
    }
  }

  showMatchResult(type, winnerName) {
    const banner = document.getElementById('mc-result-banner');
    document.getElementById('mc-result-type').textContent = type;
    document.getElementById('mc-result-winner').textContent = winnerName;
    if (banner) banner.style.display = 'block';

    document.getElementById('mc-status-badge').textContent = `🏆 ${type}: ${winnerName}`;
    document.getElementById('mc-status-badge').style.background = '#16a34a';

    // Disable all round buttons
    ['mc-round1', 'mc-round2', 'mc-round3'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.pointerEvents = 'none';
    });
  }

  confirmMatchResult() {
    const s = this.mcState;
    if (!s) return;

    const winnerSide = s.scoreA > s.scoreB ? 'a' : (s.scoreB > s.scoreA ? 'b' : null);
    if (!winnerSide) {
      alert('แมตช์ยังไม่ได้ข้อสรุปผู้ชนะ');
      return;
    }

    const winnerName = winnerSide === 'a' ? s.nameA : s.nameB;
    const winnerId = winnerSide === 'a' ? s.teamAId : s.teamBId;
    const loserName = winnerSide === 'a' ? s.nameB : s.nameA;
    const loserId = winnerSide === 'a' ? s.teamBId : s.teamAId;

    const isPlayoffMatch = s.matchId && s.matchId.startsWith('PLAYOFF-');

    // Update match in this.matches if regular match
    let match = this.matches.find(m => m.id === s.matchId);
    if (!match && !isPlayoffMatch) {
      match = {
        id: s.matchId,
        serverAId: s.teamAId,
        serverBId: s.teamBId,
        serverAName: s.nameA,
        serverBName: s.nameB,
        rounds: []
      };
      this.matches.unshift(match);
    }

    if (match) {
      match.status = 'COMPLETED';
      match.scoreA = s.scoreA;
      match.scoreB = s.scoreB;
      match.winner = winnerId;
      match.winType = (s.scoreA === 2 && s.scoreB === 0) || (s.scoreB === 2 && s.scoreA === 0) ? 'ABSOLUTE WIN' : 'DECISIVE WIN';
      match.confirmedAt = new Date().toLocaleString('th-TH');
      match.confirmedBy = this.isReferee ? `Referee (${this.refereeName})` : 'Admin';
      this.saveMatches();
    }

    // Automatic Bracket Advance if Playoff match
    if (isPlayoffMatch) {
      this.advancePlayoffWinner(
        s.matchId,
        { id: winnerId, name: winnerName },
        { id: loserId, name: loserName }
      );
    }

    // Re-calculate rankings automatically
    this.computeRankings();
    this.renderRankings();
    this.renderTeams();
    this.renderMatches();
    this.populateMatchControlSelects();

    // Log to Audit Log
    this.addAuditLog(
      this.isReferee ? `Referee (${this.refereeName})` : 'Admin',
      'CONFIRM_MATCH',
      `ยืนยันผลแมตช์ ${s.matchId}: ${winnerName} ชนะ (${s.scoreA} - ${s.scoreB})`
    );

    if (isPlayoffMatch) {
      alert(`✅ ยืนยันผลการแข่งขันเรียบร้อยแล้ว!\n\nแมตช์ Playoff: ${s.nameA} vs ${s.nameB}\nผลคะแนน: ${s.scoreA} - ${s.scoreB}\nผู้ชนะ: ${winnerName}\n\n⚡ ระบบ Automatic Bracket Advance ได้เลื่อนทีมผู้ชนะเข้าสู่รอบถัดไปโดยอัตโนมัติแล้ว`);
      window.location.hash = '#playoff';
    } else {
      alert(`✅ ยืนยันผลการแข่งขันเรียบร้อยแล้ว!\n\nแมตช์: ${s.nameA} vs ${s.nameB}\nผลคะแนน: ${s.scoreA} - ${s.scoreB}\nผู้ชนะ: ${winnerName}\n\n🏆 ระบบได้คำนวณและอัปเดตข้อมูลเข้าสู่ตาราง RANKING โดยอัตโนมัติแล้ว`);
      window.location.hash = '#ranking';
    }
  }

  resetMatchControl() {
    this.mcState = null;
    document.getElementById('mc-scoreboard').style.display = 'none';
    document.getElementById('mc-result-banner').style.display = 'none';
    const absBanner = document.getElementById('mc-absolute-win-banner');
    if (absBanner) absBanner.style.display = 'none';
    this.populateMatchControlSelects();
  }

  // ============================================================
  // COUNTDOWN & MATCH PAUSE OPERATIONAL ENGINE
  // ============================================================

  startCountdown(seconds = 10) {
    const overlay = document.getElementById('mc-countdown-overlay');
    const numEl = document.getElementById('mc-countdown-number');
    if (!overlay || !numEl) return;

    if (this.countdownTimer) clearInterval(this.countdownTimer);

    let count = seconds;
    numEl.textContent = count;
    overlay.style.display = 'flex';

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        numEl.textContent = count;
      } else if (count === 0) {
        numEl.textContent = "START!";
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        overlay.style.display = 'none';
        this.addAuditLog(null, 'MATCH_START', 'นับถอยหลังสิ้นสุด → เริ่มต้นการแข่งขันอย่างเป็นทางการ');
      }
    }, 1000);
  }

  cancelCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    const overlay = document.getElementById('mc-countdown-overlay');
    if (overlay) overlay.style.display = 'none';
    this.addAuditLog(null, 'COUNTDOWN_CANCEL', 'ยกเลิกการนับถอยหลังก่อนแข่ง');
  }

  toggleMatchPause() {
    this.isMatchPaused = !this.isMatchPaused;
    const tag = document.getElementById('mc-match-paused-tag');
    const btn = document.getElementById('mc-toggle-pause-btn');
    if (this.isMatchPaused) {
      const reason = prompt("ระบุเหตุผลการหยุดการแข่งขันชั่วคราว:", "Technical Issue / ตรวจสอบกติกา") || "Pause โดยกรรมการ";
      if (tag) tag.style.display = 'inline-block';
      if (btn) { btn.textContent = '▶️ RESUME MATCH'; btn.style.color = '#16a34a'; btn.style.borderColor = '#16a34a'; }
      this.addAuditLog(null, 'MATCH_PAUSED', `หยุดการแข่งชั่วคราว: ${reason}`);
    } else {
      if (tag) tag.style.display = 'none';
      if (btn) { btn.textContent = '⏸️ PAUSE MATCH'; btn.style.color = ''; btn.style.borderColor = ''; }
      this.addAuditLog(null, 'MATCH_RESUMED', 'กลับมาแข่งขันต่อตามปกติ');
    }
  }

  // ============================================================
  // PLAYOFF BRACKET & SEEDING ENGINE (DOUBLE ELIMINATION: 4 สายบน + 4 สายล่าง)
  // ============================================================

  loadPlayoffMatches() {
    const raw = localStorage.getItem("gaku_playoff_matches");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 10) return parsed;
      } catch (e) {
        console.error("Failed to parse playoff matches:", e);
      }
    }
    return this.generateDefaultPlayoffBracket();
  }

  savePlayoffMatches() {
    localStorage.setItem("gaku_playoff_matches", JSON.stringify(this.playoffMatches));
  }

  generateDefaultPlayoffBracket() {
    const teams = (this.teams || []).slice(0, 8);
    const seeds = teams.map(t => ({ id: t.id, name: t.name }));
    while (seeds.length < 8) {
      const idx = seeds.length + 1;
      const letter = String.fromCharCode(64 + idx);
      seeds.push({ id: `srv-00${idx}`, name: `SERVER ${letter}` });
    }

    return [
      // ------------------------------------------------------------
      // UPPER BRACKET (สายบน - 4 อันดับแรก: #1, #2, #3, #4)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-UB-SF1",
        bracketType: "UPPER",
        round: "UPPER SEMIFINAL",
        name: "UB-SF1: อันดับ 1 vs อันดับ 4",
        dropInfo: "⬇ แพ้ตกไปสายล่าง LB-R2-2",
        seedA: 1,
        seedB: 4,
        sourceA: "#1 SEED (สายบน)",
        sourceB: "#4 SEED (สายบน)",
        serverAId: seeds[0]?.id || null,
        serverAName: seeds[0]?.name || null,
        serverBId: seeds[3]?.id || null,
        serverBName: seeds[3]?.name || null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-UB-SF2",
        bracketType: "UPPER",
        round: "UPPER SEMIFINAL",
        name: "UB-SF2: อันดับ 2 vs อันดับ 3",
        dropInfo: "⬇ แพ้ตกไปสายล่าง LB-R2-1",
        seedA: 2,
        seedB: 3,
        sourceA: "#2 SEED (สายบน)",
        sourceB: "#3 SEED (สายบน)",
        serverAId: seeds[1]?.id || null,
        serverAName: seeds[1]?.name || null,
        serverBId: seeds[2]?.id || null,
        serverBName: seeds[2]?.name || null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-UB-FINAL",
        bracketType: "UPPER",
        round: "UPPER FINAL",
        name: "UB-FINAL: ชิงชนะเลิศสายบน",
        dropInfo: "⭐ ชนะเข้า GRAND FINAL · แพ้ตกไป LB-FINAL",
        sourceA: "ผู้ชนะ UB-SF1",
        sourceB: "ผู้ชนะ UB-SF2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },

      // ------------------------------------------------------------
      // LOWER BRACKET (สายล่าง - 4 อันดับล่าง: #5, #6, #7, #8 เริ่มต้นที่นี่)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-LB-R1-1",
        bracketType: "LOWER",
        round: "LOWER ROUND 1",
        name: "LB-R1-1: อันดับ 5 vs อันดับ 8",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 7-8)",
        seedA: 5,
        seedB: 8,
        sourceA: "#5 SEED (สายล่าง)",
        sourceB: "#8 SEED (สายล่าง)",
        serverAId: seeds[4]?.id || null,
        serverAName: seeds[4]?.name || null,
        serverBId: seeds[7]?.id || null,
        serverBName: seeds[7]?.name || null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R1-2",
        bracketType: "LOWER",
        round: "LOWER ROUND 1",
        name: "LB-R1-2: อันดับ 6 vs อันดับ 7",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 7-8)",
        seedA: 6,
        seedB: 7,
        sourceA: "#6 SEED (สายล่าง)",
        sourceB: "#7 SEED (สายล่าง)",
        serverAId: seeds[5]?.id || null,
        serverAName: seeds[5]?.name || null,
        serverBId: seeds[6]?.id || null,
        serverBName: seeds[6]?.name || null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R2-1",
        bracketType: "LOWER",
        round: "LOWER ROUND 2",
        name: "LB-R2-1: ผู้ชนะ LB-R1-1 vs ผู้แพ้ UB-SF2",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 5-6)",
        sourceA: "ผู้ชนะ LB-R1-1",
        sourceB: "ผู้แพ้ UB-SF2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R2-2",
        bracketType: "LOWER",
        round: "LOWER ROUND 2",
        name: "LB-R2-2: ผู้ชนะ LB-R1-2 vs ผู้แพ้ UB-SF1",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 5-6)",
        sourceA: "ผู้ชนะ LB-R1-2",
        sourceB: "ผู้แพ้ UB-SF1",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-SF",
        bracketType: "LOWER",
        round: "LOWER SEMIFINAL",
        name: "LB-SF: ผู้ชนะ LB-R2-1 vs ผู้ชนะ LB-R2-2",
        dropInfo: "❌ ผู้แพ้ได้อันดับ 4 · ผู้ชนะเข้าชิงตั๋ว Lower Final",
        sourceA: "ผู้ชนะ LB-R2-1",
        sourceB: "ผู้ชนะ LB-R2-2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-FINAL",
        bracketType: "LOWER",
        round: "LOWER FINAL",
        name: "LB-FINAL: ผู้ชนะ LB-SF vs ผู้แพ้ UB-FINAL",
        dropInfo: "⭐ ผู้ชนะตีตั๋วกลับขึ้นสายบนสู่ GRAND FINAL! (แพ้ได้อันดับ 3)",
        sourceA: "ผู้ชนะ LB-SF",
        sourceB: "ผู้แพ้ UB-FINAL",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },

      // ------------------------------------------------------------
      // GRAND FINAL (ชิงชนะเลิศสูงสุด: แชมป์สายบน vs แชมป์สายล่าง)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-GRAND-FINAL",
        bracketType: "GRAND_FINAL",
        round: "GRAND FINAL",
        name: "GRAND FINAL: แชมป์สายบน vs แชมป์สายล่าง",
        dropInfo: "👑 ผู้ชนะครองตำแหน่ง KING OF GAKURAN GRAND CHAMPION!",
        sourceA: "แชมป์สายบน (Winner UB-FINAL)",
        sourceB: "แชมป์สายล่าง (Winner LB-FINAL)",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      }
    ];
  }

  generatePlayoffBracketFromSeeding() {
    const sorted = this.computeRankings();
    if (!sorted || sorted.length < 2) {
      alert("ข้อมูลการจัดอันดับไม่เพียงพอสำหรับการสร้าง Playoff (ต้องมีอย่างน้อย 2 ทีม)");
      return;
    }

    const top8 = sorted.slice(0, 8);
    // Fill remaining seeds if less than 8
    while (top8.length < 8) {
      const idx = top8.length + 1;
      const letter = String.fromCharCode(64 + idx);
      top8.push({ id: `srv-00${idx}`, name: `SERVER ${letter}` });
    }

    this.playoffMatches = [
      // ------------------------------------------------------------
      // UPPER BRACKET (สายบน - 4 อันดับแรก: #1, #2, #3, #4)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-UB-SF1",
        bracketType: "UPPER",
        round: "UPPER SEMIFINAL",
        name: "UB-SF1: อันดับ 1 vs อันดับ 4",
        dropInfo: "⬇ แพ้ตกไปสายล่าง LB-R2-2",
        seedA: 1,
        seedB: 4,
        sourceA: "#1 SEED (สายบน)",
        sourceB: "#4 SEED (สายบน)",
        serverAId: top8[0].id,
        serverAName: top8[0].name,
        serverBId: top8[3].id,
        serverBName: top8[3].name,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-UB-SF2",
        bracketType: "UPPER",
        round: "UPPER SEMIFINAL",
        name: "UB-SF2: อันดับ 2 vs อันดับ 3",
        dropInfo: "⬇ แพ้ตกไปสายล่าง LB-R2-1",
        seedA: 2,
        seedB: 3,
        sourceA: "#2 SEED (สายบน)",
        sourceB: "#3 SEED (สายบน)",
        serverAId: top8[1].id,
        serverAName: top8[1].name,
        serverBId: top8[2].id,
        serverBName: top8[2].name,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-UB-FINAL",
        bracketType: "UPPER",
        round: "UPPER FINAL",
        name: "UB-FINAL: ชิงชนะเลิศสายบน",
        dropInfo: "⭐ ชนะเข้า GRAND FINAL · แพ้ตกไป LB-FINAL",
        sourceA: "ผู้ชนะ UB-SF1",
        sourceB: "ผู้ชนะ UB-SF2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },

      // ------------------------------------------------------------
      // LOWER BRACKET (สายล่าง - 4 อันดับล่าง: #5, #6, #7, #8 เริ่มต้นที่นี่)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-LB-R1-1",
        bracketType: "LOWER",
        round: "LOWER ROUND 1",
        name: "LB-R1-1: อันดับ 5 vs อันดับ 8",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 7-8)",
        seedA: 5,
        seedB: 8,
        sourceA: "#5 SEED (สายล่าง)",
        sourceB: "#8 SEED (สายล่าง)",
        serverAId: top8[4].id,
        serverAName: top8[4].name,
        serverBId: top8[7].id,
        serverBName: top8[7].name,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R1-2",
        bracketType: "LOWER",
        round: "LOWER ROUND 1",
        name: "LB-R1-2: อันดับ 6 vs อันดับ 7",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 7-8)",
        seedA: 6,
        seedB: 7,
        sourceA: "#6 SEED (สายล่าง)",
        sourceB: "#7 SEED (สายล่าง)",
        serverAId: top8[5].id,
        serverAName: top8[5].name,
        serverBId: top8[6].id,
        serverBName: top8[6].name,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R2-1",
        bracketType: "LOWER",
        round: "LOWER ROUND 2",
        name: "LB-R2-1: ผู้ชนะ LB-R1-1 vs ผู้แพ้ UB-SF2",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 5-6)",
        sourceA: "ผู้ชนะ LB-R1-1",
        sourceB: "ผู้แพ้ UB-SF2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-R2-2",
        bracketType: "LOWER",
        round: "LOWER ROUND 2",
        name: "LB-R2-2: ผู้ชนะ LB-R1-2 vs ผู้แพ้ UB-SF1",
        dropInfo: "❌ ผู้แพ้ตกรอบทันที (จบอันดับ 5-6)",
        sourceA: "ผู้ชนะ LB-R1-2",
        sourceB: "ผู้แพ้ UB-SF1",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-SF",
        bracketType: "LOWER",
        round: "LOWER SEMIFINAL",
        name: "LB-SF: ผู้ชนะ LB-R2-1 vs ผู้ชนะ LB-R2-2",
        dropInfo: "❌ ผู้แพ้ได้อันดับ 4 · ผู้ชนะเข้าชิงตั๋ว Lower Final",
        sourceA: "ผู้ชนะ LB-R2-1",
        sourceB: "ผู้ชนะ LB-R2-2",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },
      {
        id: "PLAYOFF-LB-FINAL",
        bracketType: "LOWER",
        round: "LOWER FINAL",
        name: "LB-FINAL: ผู้ชนะ LB-SF vs ผู้แพ้ UB-FINAL",
        dropInfo: "⭐ ผู้ชนะตีตั๋วกลับขึ้นสายบนสู่ GRAND FINAL! (แพ้ได้อันดับ 3)",
        sourceA: "ผู้ชนะ LB-SF",
        sourceB: "ผู้แพ้ UB-FINAL",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      },

      // ------------------------------------------------------------
      // GRAND FINAL (ชิงชนะเลิศ: แชมป์สายบน vs แชมป์สายล่าง)
      // ------------------------------------------------------------
      {
        id: "PLAYOFF-GRAND-FINAL",
        bracketType: "GRAND_FINAL",
        round: "GRAND FINAL",
        name: "GRAND FINAL: แชมป์สายบน vs แชมป์สายล่าง",
        dropInfo: "👑 ผู้ชนะครองตำแหน่ง KING OF GAKURAN GRAND CHAMPION!",
        sourceA: "แชมป์สายบน (Winner UB-FINAL)",
        sourceB: "แชมป์สายล่าง (Winner LB-FINAL)",
        serverAId: null,
        serverAName: null,
        serverBId: null,
        serverBName: null,
        status: "UPCOMING",
        scoreA: 0,
        scoreB: 0,
        winner: null
      }
    ];

    this.savePlayoffMatches();
    this.renderPlayoffBracket();
    this.populateMatchControlSelects();
    this.addAuditLog("Admin / Seeding Engine", "RESEED_PLAYOFF", `จัดสายการแข่งขัน Double Elimination Playoff: 4 อันดับแรก (#1-#4) เข้าสายบน, 4 อันดับล่าง (#5-#8) เข้าสายล่าง สำเร็จ`);
    alert(`⚡ สร้างสายการแข่งขัน Double Elimination Playoff สำเร็จ!\n\n🔷 สายบน (Upper Bracket): อันดับ 1-4 (${top8.slice(0,4).map(t => t.name).join(', ')})\n🔶 สายล่าง (Lower Bracket): อันดับ 5-8 (${top8.slice(4,8).map(t => t.name).join(', ')})`);
  }

  advancePlayoffWinner(matchId, winnerTeam, loserTeam) {
    if (!this.playoffMatches) return;

    let advancedDesc = "";

    // Helper to find match
    const findM = (id) => this.playoffMatches.find(m => m.id === id);

    // 1. Upper Semifinals routing (Cross-over into Lower Round 2)
    if (matchId === "PLAYOFF-UB-SF1" || matchId === "PLAYOFF-SF1") {
      const ubFin = findM("PLAYOFF-UB-FINAL");
      const lbR2 = findM("PLAYOFF-LB-R2-2");
      if (ubFin) { ubFin.serverAId = winnerTeam.id; ubFin.serverAName = winnerTeam.name; }
      if (lbR2 && loserTeam) { lbR2.serverBId = loserTeam.id; lbR2.serverBName = loserTeam.name; }
      advancedDesc = `UB-SF1: ${winnerTeam.name} ผ่านเข้า UPPER FINAL | ${loserTeam.name} ตกลงไปสายล่าง LB-R2-2`;
    } else if (matchId === "PLAYOFF-UB-SF2" || matchId === "PLAYOFF-SF2") {
      const ubFin = findM("PLAYOFF-UB-FINAL");
      const lbR2 = findM("PLAYOFF-LB-R2-1");
      if (ubFin) { ubFin.serverBId = winnerTeam.id; ubFin.serverBName = winnerTeam.name; }
      if (lbR2 && loserTeam) { lbR2.serverBId = loserTeam.id; lbR2.serverBName = loserTeam.name; }
      advancedDesc = `UB-SF2: ${winnerTeam.name} ผ่านเข้า UPPER FINAL | ${loserTeam.name} ตกลงไปสายล่าง LB-R2-1`;
    } 
    // 2. Upper Final routing (Winner -> Grand Final, Loser -> Lower Final)
    else if (matchId === "PLAYOFF-UB-FINAL") {
      const grandFin = findM("PLAYOFF-GRAND-FINAL");
      const lbFin = findM("PLAYOFF-LB-FINAL");
      if (grandFin) { grandFin.serverAId = winnerTeam.id; grandFin.serverAName = winnerTeam.name; }
      if (lbFin && loserTeam) { lbFin.serverBId = loserTeam.id; lbFin.serverBName = loserTeam.name; }
      advancedDesc = `UB-FINAL: ${winnerTeam.name} ชนะสายบนเข้าสู่ GRAND FINAL! | ${loserTeam.name} ตกลงไปชิงตั๋วใน LOWER FINAL`;
    }
    // 3. Lower Round 1 routing (4 อันดับล่าง #5-#8)
    else if (matchId === "PLAYOFF-LB-R1-1") {
      const lbR2 = findM("PLAYOFF-LB-R2-1");
      if (lbR2) { lbR2.serverAId = winnerTeam.id; lbR2.serverAName = winnerTeam.name; }
      advancedDesc = `LB-R1-1: ${winnerTeam.name} ชนะเข้าสู่ Lower Round 2 | ${loserTeam.name} ตกรอบ (อันดับ 7-8)`;
    } else if (matchId === "PLAYOFF-LB-R1-2") {
      const lbR2 = findM("PLAYOFF-LB-R2-2");
      if (lbR2) { lbR2.serverAId = winnerTeam.id; lbR2.serverAName = winnerTeam.name; }
      advancedDesc = `LB-R1-2: ${winnerTeam.name} ชนะเข้าสู่ Lower Round 2 | ${loserTeam.name} ตกรอบ (อันดับ 7-8)`;
    }
    // 4. Lower Round 2 routing (Winner LB-R1 vs Loser UB-SF)
    else if (matchId === "PLAYOFF-LB-R2-1") {
      const lbSf = findM("PLAYOFF-LB-SF");
      if (lbSf) { lbSf.serverAId = winnerTeam.id; lbSf.serverAName = winnerTeam.name; }
      advancedDesc = `LB-R2-1: ${winnerTeam.name} ชนะเข้าสู่ LOWER SEMIFINAL | ${loserTeam.name} จบอันดับ 5-6`;
    } else if (matchId === "PLAYOFF-LB-R2-2") {
      const lbSf = findM("PLAYOFF-LB-SF");
      if (lbSf) { lbSf.serverBId = winnerTeam.id; lbSf.serverBName = winnerTeam.name; }
      advancedDesc = `LB-R2-2: ${winnerTeam.name} ชนะเข้าสู่ LOWER SEMIFINAL | ${loserTeam.name} จบอันดับ 5-6`;
    }
    // 5. Lower Semifinal routing
    else if (matchId === "PLAYOFF-LB-SF") {
      const lbFin = findM("PLAYOFF-LB-FINAL");
      if (lbFin) { lbFin.serverAId = winnerTeam.id; lbFin.serverAName = winnerTeam.name; }
      advancedDesc = `LB-SF: ${winnerTeam.name} ชนะเข้าสู่ LOWER FINAL | ${loserTeam.name} จบอันดับ 4`;
    }
    // 6. Lower Final routing -> WINNER ADVANCES TO GRAND FINAL (ทีมสายล่างทีมสุดท้ายได้กลับขึ้นสายบน!)
    else if (matchId === "PLAYOFF-LB-FINAL") {
      const grandFin = findM("PLAYOFF-GRAND-FINAL");
      if (grandFin) { grandFin.serverBId = winnerTeam.id; grandFin.serverBName = winnerTeam.name; }
      advancedDesc = `⭐ LB-FINAL: ${winnerTeam.name} แชมป์สายล่าง ตีตั๋วกลับขึ้นสู่สายบนเข้าชิง GRAND FINAL กับแชมป์สายบน! 🏆 | ${loserTeam.name} จบอันดับ 3`;
    }
    // 7. Grand Final routing
    else if (matchId === "PLAYOFF-GRAND-FINAL" || matchId === "PLAYOFF-FINAL") {
      advancedDesc = `👑 แชมป์เปี้ยนสูงสุดแห่งทัวร์นาเมนต์: ${winnerTeam.name} คือ KING OF GAKURAN GRAND CHAMPION! 🏆`;
    }

    // Mark current match in playoffMatches as completed
    const currentPlayoff = this.playoffMatches.find(m => m.id === matchId);
    if (currentPlayoff) {
      currentPlayoff.status = "COMPLETED";
      currentPlayoff.winner = winnerTeam.id;
      currentPlayoff.winnerName = winnerTeam.name;
      if (this.mcState) {
        currentPlayoff.scoreA = this.mcState.scoreA;
        currentPlayoff.scoreB = this.mcState.scoreB;
      }
    }

    this.savePlayoffMatches();
    this.renderPlayoffBracket();
    if (advancedDesc) {
      this.addAuditLog("Playoff Engine", "BRACKET_ADVANCE", advancedDesc);
    }
  }

  renderPlayoffBracket() {
    const chipsWrap = document.getElementById('playoff-seeding-chips');
    const grandFinalWrap = document.getElementById('bracket-grand-final');
    const ubQfWrap = document.getElementById('bracket-ub-qf');
    const ubSfWrap = document.getElementById('bracket-ub-sf');
    const ubFinalWrap = document.getElementById('bracket-ub-final');
    const lbR1Wrap = document.getElementById('bracket-lb-r1');
    const lbR2Wrap = document.getElementById('bracket-lb-r2');
    const lbSfWrap = document.getElementById('bracket-lb-sf');
    const lbFinalWrap = document.getElementById('bracket-lb-final');

    if (!this.playoffMatches || this.playoffMatches.length !== 10) {
      this.playoffMatches = this.loadPlayoffMatches();
    }

    // 1. Render Top 8 Seeding Chips (Highlighting Top 4 as Upper Bracket, 5-8 as Lower Bracket)
    if (chipsWrap) {
      const sorted = this.computeRankings();
      const top8 = sorted.slice(0, 8);
      if (top8.length === 0) {
        chipsWrap.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 14px; background: #F9FAFB; border-radius: 6px; border: 1px dashed #E5E7EB;">
            ยังไม่มีข้อมูลอันดับเซิร์ฟเวอร์ (รอการแข่งขันรอบ Online เก็บแต้มเพื่อจัด Seed #1 - #8)
          </div>
        `;
      } else {
        chipsWrap.innerHTML = top8.map((t, idx) => {
          const rank = idx + 1;
          const isUpper = rank <= 4;
          return `
          <div style="background: ${isUpper ? '#EFF6FF' : '#FFFBEB'}; border: 1px solid ${isUpper ? '#BFDBFE' : '#FDE68A'}; border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 900; color: ${isUpper ? '#1D4ED8' : '#D97706'}; font-size: 0.85rem;">#${rank}</span>
            <div style="overflow: hidden; flex: 1;">
              <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <span style="font-size: 0.65rem; color: #888;">${t.stats?.points || 0} PTS</span>
                <span style="font-size: 0.62rem; font-weight: 800; color: ${isUpper ? '#1D4ED8' : '#B45309'};">${isUpper ? '🔷 สายบน' : '🔶 สายล่าง'}</span>
              </div>
            </div>
          </div>
        `}).join('');
      }
    }

    const renderBracketCard = (m, cardType = 'upper') => {
      if (!m) return '';
      const isLive = m.status === 'LIVE';
      const isCompleted = m.status === 'COMPLETED';
      const winnerA = isCompleted && (m.winner === m.serverAId || m.winner === m.serverAName);
      const winnerB = isCompleted && (m.winner === m.serverBId || m.winner === m.serverBName);

      let themeClass = 'is-upper';
      if (cardType === 'lower') themeClass = 'is-lower';
      if (cardType === 'final') themeClass = 'is-final';

      return `
        <div class="bracket-card ${themeClass} ${isLive ? 'is-live' : ''}">
          <div class="bracket-card-meta">
            <span style="font-weight: 800; font-size: 0.72rem; color: ${cardType === 'lower' ? '#B45309' : (cardType === 'final' ? '#92400E' : '#1D4ED8')};">
              ${m.id}
            </span>
            <span class="badge-pill ${isCompleted ? 'badge-verified' : (isLive ? 'badge-eliminated' : 'badge-pending')}" style="font-size: 0.6rem; padding: 2px 6px;">
              ${m.status}
            </span>
          </div>

          <!-- Team A -->
          <div class="bracket-team-row ${winnerA ? 'is-winner' : (isCompleted ? 'is-loser' : '')}">
            <div class="bracket-team-info">
              ${m.seedA ? `<span class="bracket-seed">#${m.seedA}</span>` : ''}
              <span class="bracket-team-name">${m.serverAName || m.sourceA || 'TBD'}</span>
            </div>
            <div class="bracket-score">${m.scoreA ?? 0}</div>
          </div>

          <!-- Team B -->
          <div class="bracket-team-row ${winnerB ? 'is-winner' : (isCompleted ? 'is-loser' : '')}">
            <div class="bracket-team-info">
              ${m.seedB ? `<span class="bracket-seed">#${m.seedB}</span>` : ''}
              <span class="bracket-team-name">${m.serverBName || m.sourceB || 'TBD'}</span>
            </div>
            <div class="bracket-score">${m.scoreB ?? 0}</div>
          </div>

          <!-- Advance / Drop Notice Tag -->
          ${m.dropInfo ? `
            <div style="margin-top: 6px;">
              <span class="bracket-drop-tag">${m.dropInfo}</span>
            </div>
          ` : ''}

          <!-- Action Button to load directly into Match Control -->
          ${m.serverAId && m.serverBId ? `
            <div style="margin-top: 8px; text-align: right;">
              <a href="#match-control" class="btn btn-outline btn-load-bracket-match" data-matchid="${m.id}" style="font-size: 0.65rem; padding: 4px 10px; border-color: rgba(0,0,0,0.15);">
                ${isCompleted ? 'VIEW RESULT 👁️' : '⚔️ MATCH CONTROL'}
              </a>
            </div>
          ` : ''}
        </div>
      `;
    };

    // 2. Render Grand Final Showcase
    if (grandFinalWrap) {
      const gf = this.playoffMatches.find(m => m.id === 'PLAYOFF-GRAND-FINAL' || m.bracketType === 'GRAND_FINAL');
      if (gf) grandFinalWrap.innerHTML = renderBracketCard(gf, 'final');
    }

    // 3. Render Upper Bracket: SF, FINAL (Clear QF if column container still exists)
    if (ubQfWrap) {
      ubQfWrap.innerHTML = '';
      if (ubQfWrap.parentElement) ubQfWrap.parentElement.style.display = 'none';
    }

    if (ubSfWrap) {
      const usfs = this.playoffMatches.filter(m => m.id.startsWith('PLAYOFF-UB-SF'));
      ubSfWrap.innerHTML = usfs.map(m => renderBracketCard(m, 'upper')).join('');
    }

    if (ubFinalWrap) {
      const uFin = this.playoffMatches.find(m => m.id === 'PLAYOFF-UB-FINAL');
      if (uFin) ubFinalWrap.innerHTML = renderBracketCard(uFin, 'upper');
    }

    // 4. Render Lower Bracket: R1, R2, SF, FINAL
    if (lbR1Wrap) {
      const lr1s = this.playoffMatches.filter(m => m.id.startsWith('PLAYOFF-LB-R1'));
      lbR1Wrap.innerHTML = lr1s.map(m => renderBracketCard(m, 'lower')).join('');
    }

    if (lbR2Wrap) {
      const lr2s = this.playoffMatches.filter(m => m.id.startsWith('PLAYOFF-LB-R2'));
      lbR2Wrap.innerHTML = lr2s.map(m => renderBracketCard(m, 'lower')).join('');
    }

    if (lbSfWrap) {
      const lSf = this.playoffMatches.find(m => m.id === 'PLAYOFF-LB-SF');
      if (lSf) lbSfWrap.innerHTML = renderBracketCard(lSf, 'lower');
    }

    if (lbFinalWrap) {
      const lFin = this.playoffMatches.find(m => m.id === 'PLAYOFF-LB-FINAL');
      if (lFin) lbFinalWrap.innerHTML = renderBracketCard(lFin, 'lower');
    }
  }


  // ============================================================
  // SERVER OWNER PORTAL & VERIFICATION CODE ENGINE
  // ============================================================

  loadCurrentServerOwner() {
    const raw = localStorage.getItem("gaku_current_server_owner");
    if (raw) {
      try {
        const id = JSON.parse(raw);
        return this.teams.find(t => t.id === id) || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  saveCurrentServerOwner(teamId) {
    if (teamId) {
      localStorage.setItem("gaku_current_server_owner", JSON.stringify(teamId));
    } else {
      localStorage.removeItem("gaku_current_server_owner");
    }
  }

  handleServerOwnerLogin(serverId, code) {
    const team = this.teams.find(t => t.id === serverId);
    if (!team) return false;
    const cleanCode = (code || '').trim().toUpperCase();
    if (team.verificationCode && team.verificationCode.toUpperCase() === cleanCode) {
      this.currentServerOwner = team;
      this.saveCurrentServerOwner(team.id);
      this.addAuditLog(team.owner, 'OWNER_LOGIN', `${team.name} เข้าสู่ระบบจัดการเซิร์ฟเวอร์`);
      this.renderServerOwnerPortal();
      return true;
    }
    return false;
  }

  handleServerOwnerLogout() {
    if (this.currentServerOwner) {
      this.addAuditLog(this.currentServerOwner.owner, 'OWNER_LOGOUT', `${this.currentServerOwner.name} ออกจากระบบจัดการเซิร์ฟเวอร์`);
    }
    this.currentServerOwner = null;
    this.saveCurrentServerOwner(null);
    this.renderServerOwnerPortal();
  }

  regenerateServerCode() {
    if (!this.currentServerOwner) return;
    const letter = (this.currentServerOwner.name.split(' ')[1] || 'X').charAt(0);
    const randNum = Math.floor(100 + Math.random() * 900);
    const newCode = `GAKU-${letter}${randNum}`;
    const oldCode = this.currentServerOwner.verificationCode;
    this.currentServerOwner.verificationCode = newCode;
    this.saveTeams();
    this.addAuditLog(this.currentServerOwner.owner, 'REGEN_CODE', `เปลี่ยน Verification Code ของ ${this.currentServerOwner.name} จาก ${oldCode} เป็น ${newCode}`);
    alert(`สร้าง Verification Code ใหม่เรียบร้อยแล้ว: ${newCode}`);
    this.renderServerOwnerPortal();
  }

  checkinAllStarters() {
    if (!this.currentServerOwner) return;
    if (!this.currentServerOwner.playerCheckIns) this.currentServerOwner.playerCheckIns = {};
    (this.currentServerOwner.starters || []).forEach(p => {
      this.currentServerOwner.playerCheckIns[p] = true;
    });
    this.currentServerOwner.checkInStatus = "CHECKED_IN";
    this.saveTeams();
    this.addAuditLog(this.currentServerOwner.owner, 'PLAYER_CHECKIN', `${this.currentServerOwner.name} ยืนยัน Check-in ผู้เล่น Starter ครบ 15 คน`);
    this.renderServerOwnerPortal();
  }

  toggleStarterCheckin(starterId) {
    if (!this.currentServerOwner) return;
    if (!this.currentServerOwner.playerCheckIns) this.currentServerOwner.playerCheckIns = {};
    this.currentServerOwner.playerCheckIns[starterId] = !this.currentServerOwner.playerCheckIns[starterId];
    this.saveTeams();
    this.renderServerOwnerPortal();
  }

  emergencySubstitute(starterId, subId, reason) {
    if (!this.currentServerOwner) return;
    const team = this.currentServerOwner;
    const starterIdx = (team.starters || []).indexOf(starterId);
    const subIdx = (team.subs || []).indexOf(subId);

    if (starterIdx === -1 || subIdx === -1) {
      alert("ไม่พบข้อมูลผู้เล่นใน Roster");
      return;
    }

    // Swap starter and substitute
    team.starters[starterIdx] = subId;
    team.subs[subIdx] = starterId;

    // Log & notify
    const details = `เปลี่ยนตัวฉุกเฉิน: ${starterId} (Starter) ⇄ ${subId} (Substitute) | เหตุผล: ${reason}`;
    this.addAuditLog(team.owner, 'EMERGENCY_SUB', `${team.name} ${details}`);
    if (!team.notifications) team.notifications = [];
    team.notifications.unshift({
      id: `notif-${Date.now()}`,
      text: `คำขอเปลี่ยนตัวสำเร็จ: นำ ${subId} ลงแทน ${starterId} (${reason})`,
      read: false,
      time: "เมื่อสักครู่"
    });

    this.saveTeams();
    alert(`✅ ส่งคำขอและเปลี่ยนตัวผู้เล่นสำเร็จ!\n\n${details}`);
    this.renderServerOwnerPortal();
  }

  handleDisputeSubmit(subject, desc, evidence) {
    if (!this.currentServerOwner) return;
    const team = this.currentServerOwner;
    const disputeId = `DISPUTE-#${Math.floor(1000 + Math.random() * 9000)}`;
    const newDispute = {
      id: disputeId,
      serverId: team.id,
      serverName: team.name,
      subject: subject,
      desc: desc,
      evidence: evidence || "ไม่มีแนบหลักฐาน",
      status: "UNDER_REVIEW",
      submittedAt: new Date().toLocaleString('th-TH'),
      submittedBy: team.owner
    };
    if (!team.disputes) team.disputes = [];
    team.disputes.unshift(newDispute);
    if (!team.notifications) team.notifications = [];
    team.notifications.unshift({
      id: `notif-${Date.now()}`,
      text: `ยื่นคำร้อง ${disputeId} (${subject}) อยู่ระหว่างการพิจารณาโดยคณะกรรมการ`,
      read: false,
      time: "เมื่อสักครู่"
    });
    this.saveTeams();
    this.addAuditLog(team.owner, 'SUBMIT_DISPUTE', `${team.name} ยื่นคำร้อง ${disputeId}: ${subject}`);
    alert(`✅ ยื่นคำร้องสำเร็จ (รหัสคำร้อง: ${disputeId})\nคณะกรรมการและ Admin จะตรวจสอบหลักฐานและติดต่อกลับโดยเร็ว`);
    this.renderServerOwnerPortal();
  }

  markAllNotifsRead() {
    if (!this.currentServerOwner) return;
    (this.currentServerOwner.notifications || []).forEach(n => { n.read = true; });
    this.saveTeams();
    this.renderServerOwnerPortal();
  }

  renderServerOwnerPortal() {
    const loginScreen = document.getElementById('owner-login-screen');
    const dashboard = document.getElementById('owner-dashboard');
    const serverSelect = document.getElementById('owner-login-server-select');

    if (serverSelect) {
      serverSelect.innerHTML = '<option value="">-- เลือกเซิร์ฟเวอร์ของคุณ --</option>' +
        (this.teams || []).map(t => `<option value="${t.id}">${t.name} (Owner: ${t.owner || 'Captain'})</option>`).join('');
    }

    if (!this.currentServerOwner) {
      if (loginScreen) loginScreen.style.display = 'flex';
      if (dashboard) dashboard.style.display = 'none';
      return;
    }

    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';

    const t = this.currentServerOwner;
    const headerName = document.getElementById('owner-server-header-name');
    const dashServerName = document.getElementById('owner-dash-server-name');
    if (headerName) headerName.textContent = t.name;
    if (dashServerName) dashServerName.textContent = `${t.name} — DASHBOARD`;

    const codeEl = document.getElementById('owner-dash-code');
    if (codeEl) codeEl.textContent = t.verificationCode || 'GAKU-DEFAULT';

    const lockBadge = document.getElementById('owner-roster-lock-badge');
    const lockTxt = document.getElementById('owner-dash-lock-txt');
    const isLocked = !!t.rosterLocked;
    if (lockBadge) {
      lockBadge.className = isLocked ? 'badge-pill badge-eliminated' : 'badge-pill badge-verified';
      lockBadge.textContent = isLocked ? 'ROSTER LOCKED' : 'ROSTER OPEN';
    }
    if (lockTxt) {
      lockTxt.textContent = isLocked ? 'LOCKED' : 'OPEN';
      lockTxt.style.color = isLocked ? '#DC2626' : '#16A34A';
    }

    // Check-in count
    const checkins = t.playerCheckIns || {};
    const checkedCount = (t.starters || []).filter(p => checkins[p]).length;
    const checkinCountEl = document.getElementById('owner-dash-checkin-count');
    if (checkinCountEl) checkinCountEl.textContent = `${checkedCount} / 15`;

    const checkinStatusBadge = document.getElementById('owner-checkin-status-badge');
    if (checkinStatusBadge) {
      const isAllChecked = checkedCount >= 15;
      checkinStatusBadge.className = isAllChecked ? 'badge-pill badge-verified' : 'badge-pill badge-pending';
      checkinStatusBadge.textContent = isAllChecked ? 'CHECK-IN: COMPLETE' : `CHECK-IN: ${checkedCount}/15`;
    }

    // Rank & Points
    const rank = this.teams.indexOf(t) + 1;
    const rankEl = document.getElementById('owner-dash-rank');
    const ptsEl = document.getElementById('owner-dash-pts');
    if (rankEl) rankEl.textContent = `#${rank}`;
    if (ptsEl) ptsEl.textContent = `${t.stats?.points || 0} PTS (${t.stats?.won || 0}W - ${t.stats?.lost || 0}L)`;

    // Render Starters check-in list
    const startersList = document.getElementById('owner-starters-checkin-list');
    if (startersList) {
      startersList.innerHTML = (t.starters || []).map((p, idx) => {
        const isChecked = !!checkins[p];
        return `
          <div class="checkin-item ${isChecked ? 'checked' : ''}">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.72rem; font-weight: 800; color: #888; width: 24px;">#${String(idx + 1).padStart(2, '0')}</span>
              <strong style="font-size: 0.88rem;">${p}</strong>
              <span class="badge-pill ${isChecked ? 'badge-verified' : 'badge-pending'}" style="font-size: 0.65rem; padding: 2px 8px;">
                ${isChecked ? '✓ CHECKED IN' : '⏳ WAITING'}
              </span>
            </div>
            <button class="btn btn-outline owner-player-checkin-btn" data-player="${p}" style="font-size: 0.7rem; padding: 4px 10px; ${isChecked ? 'color: #DC2626; border-color: #FCA5A5;' : 'color: #16A34A; border-color: #86EFAC;'}">
              ${isChecked ? 'CANCEL' : 'CHECK IN'}
            </button>
          </div>
        `;
      }).join('');
    }

    // Populate emergency sub selects
    const starterSel = document.getElementById('owner-sub-starter-select');
    const subSel = document.getElementById('owner-sub-sub-select');
    if (starterSel) {
      starterSel.innerHTML = (t.starters || []).map(p => `<option value="${p}">${p} (Starter)</option>`).join('');
    }
    if (subSel) {
      subSel.innerHTML = (t.subs || []).map(p => `<option value="${p}">${p} (Substitute)</option>`).join('');
    }

    // Schedule list for this server
    const scheduleList = document.getElementById('owner-schedule-list');
    if (scheduleList) {
      const myMatches = (this.matches || []).concat(this.playoffMatches || []).filter(m =>
        m.serverAId === t.id || m.serverBId === t.id || m.serverAName === t.name || m.serverBName === t.name
      );

      if (myMatches.length === 0) {
        scheduleList.innerHTML = `<div style="font-size: 0.82rem; color: #888; padding: 12px 0;">ยังไม่มีคิวการแข่งขันในขณะนี้</div>`;
      } else {
        scheduleList.innerHTML = myMatches.map(m => {
          const isA = m.serverAId === t.id || m.serverAName === t.name;
          const oppName = isA ? (m.serverBName || m.sourceB || 'TBD') : (m.serverAName || m.sourceA || 'TBD');
          return `
            <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong style="font-size: 0.75rem; color: var(--color-brand);">${m.id} (${m.round || 'MATCH'})</strong>
                <span class="badge-pill ${m.status === 'COMPLETED' ? 'badge-verified' : (m.status === 'LIVE' ? 'badge-eliminated' : 'badge-pending')}" style="font-size: 0.65rem;">
                  ${m.status}
                </span>
              </div>
              <div style="font-size: 0.9rem; font-weight: 800;">VS ${oppName}</div>
              <div style="font-size: 0.72rem; color: #888; margin-top: 2px;">
                ${m.status === 'COMPLETED' ? `ผลการแข่ง: ${m.scoreA} - ${m.scoreB} (${m.winner === t.id || m.winner === t.name ? 'WIN 🏆' : 'LOSS'})` : 'กำหนดการ: รอการแข่งขัน'}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Notifications list
    const notifList = document.getElementById('owner-notif-list');
    if (notifList) {
      const notifs = t.notifications || [];
      if (notifs.length === 0) {
        notifList.innerHTML = `<div style="font-size: 0.82rem; color: #888; padding: 12px 0;">ไม่มีการแจ้งเตือนใหม่</div>`;
      } else {
        notifList.innerHTML = notifs.map(n => `
          <div style="padding: 10px 12px; border-bottom: 1px solid #F3F4F6; display: flex; justify-content: space-between; align-items: center; ${n.read ? 'opacity: 0.6;' : 'background: #FFFDF0;'}">
            <div>
              <div style="font-size: 0.82rem; font-weight: ${n.read ? '600' : '800'};">${n.text}</div>
              <div style="font-size: 0.68rem; color: #999; margin-top: 2px;">${n.time}</div>
            </div>
            ${!n.read ? `<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-brand);"></span>` : ''}
          </div>
        `).join('');
      }
    }
  }

  // ============================================================
  // SERVER COMPARE ENGINE
  // ============================================================

  populateServerCompareSelects() {
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');
    if (!selA || !selB) return;

    const opts = (this.teams || []).map((t, idx) => `<option value="${t.id}">${t.name} (Seed #${idx + 1})</option>`).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;

    if (this.teams.length >= 2) {
      selA.selectedIndex = 0;
      selB.selectedIndex = 1;
    }
    this.renderServerCompare();
  }

  renderServerCompare() {
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');
    const area = document.getElementById('compare-result-area');
    if (!selA || !selB || !area) return;

    const teamA = this.teams.find(t => t.id === selA.value) || this.teams[0];
    const teamB = this.teams.find(t => t.id === selB.value) || this.teams[1] || this.teams[0];
    if (!teamA || !teamB) return;

    // Calculate Head-to-Head
    const completedMatches = (this.matches || []).filter(m => m.status === 'COMPLETED');
    const h2hMatches = completedMatches.filter(m =>
      (m.serverAId === teamA.id && m.serverBId === teamB.id) ||
      (m.serverAId === teamB.id && m.serverBId === teamA.id) ||
      (m.serverAName === teamA.name && m.serverBName === teamB.name) ||
      (m.serverAName === teamB.name && m.serverBName === teamA.name)
    );

    let winsA = 0;
    let winsB = 0;
    h2hMatches.forEach(m => {
      if (m.winner === teamA.id || m.winner === teamA.name) winsA++;
      if (m.winner === teamB.id || m.winner === teamB.name) winsB++;
    });

    const rankA = this.teams.indexOf(teamA) + 1;
    const rankB = this.teams.indexOf(teamB) + 1;

    const winRateA = (teamA.stats?.played || 0) > 0 ? Math.round(((teamA.stats?.won || 0) / teamA.stats.played) * 100) : 0;
    const winRateB = (teamB.stats?.played || 0) > 0 ? Math.round(((teamB.stats?.won || 0) / teamB.stats.played) * 100) : 0;

    area.innerHTML = `
      <div class="compare-container">
        <!-- Server A -->
        <div class="compare-card">
          <div class="team-logo-shield pink-theme" style="width: 60px; height: 60px; margin: 0 auto 12px; font-size: 1.2rem;">${teamA.logoText || 'SA'}</div>
          <h3 style="font-size: 1.4rem; font-weight: 900; margin: 0 0 4px; text-transform: uppercase;">${teamA.name}</h3>
          <div style="font-size: 0.8rem; color: var(--color-brand); font-weight: 800; margin-bottom: 20px;">RANK #${rankA} · ${teamA.stats?.points || 0} PTS</div>

          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">WIN RATE</span>
            <strong style="font-size: 1.1rem; color: #16a34a;">${winRateA}%</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">MATCHES PLAYED</span>
            <strong>${teamA.stats?.played || 0}</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">MATCH WON / LOST</span>
            <strong>${teamA.stats?.won || 0}W - ${teamA.stats?.lost || 0}L</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">ROUNDS WON / LOST</span>
            <strong>${teamA.stats?.roundWon || 0}W - ${teamA.stats?.roundLost || 0}L</strong>
          </div>
        </div>

        <!-- Center VS Badge -->
        <div style="text-align: center;">
          <div style="width: 56px; height: 56px; background: #111; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; margin: 0 auto; box-shadow: var(--shadow-md);">VS</div>
          <div style="font-size: 0.72rem; font-weight: 800; color: var(--color-brand); margin-top: 8px;">HEAD TO HEAD</div>
          <div style="font-size: 1.2rem; font-weight: 900; margin-top: 2px;">${winsA} - ${winsB}</div>
        </div>

        <!-- Server B -->
        <div class="compare-card">
          <div class="team-logo-shield pink-theme" style="width: 60px; height: 60px; margin: 0 auto 12px; font-size: 1.2rem;">${teamB.logoText || 'SB'}</div>
          <h3 style="font-size: 1.4rem; font-weight: 900; margin: 0 0 4px; text-transform: uppercase;">${teamB.name}</h3>
          <div style="font-size: 0.8rem; color: var(--color-brand); font-weight: 800; margin-bottom: 20px;">RANK #${rankB} · ${teamB.stats?.points || 0} PTS</div>

          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">WIN RATE</span>
            <strong style="font-size: 1.1rem; color: #16a34a;">${winRateB}%</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">MATCHES PLAYED</span>
            <strong>${teamB.stats?.played || 0}</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">MATCH WON / LOST</span>
            <strong>${teamB.stats?.won || 0}W - ${teamB.stats?.lost || 0}L</strong>
          </div>
          <div class="compare-stat-row">
            <span style="font-size: 0.8rem; color: #666; font-weight: 700;">ROUNDS WON / LOST</span>
            <strong>${teamB.stats?.roundWon || 0}W - ${teamB.stats?.roundLost || 0}L</strong>
          </div>
        </div>
      </div>

      <!-- Prior Match History between the two -->
      <div style="background: #fff; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 20px 24px;">
        <span class="section-tag">HEAD-TO-HEAD HISTORY</span>
        <h4 style="font-size: 1rem; font-weight: 900; margin: 0 0 12px; text-transform: uppercase;">ประวัติการแข่งขันระหว่างสองทีม (${h2hMatches.length} แมตช์)</h4>
        ${h2hMatches.length === 0 ? `
          <div style="font-size: 0.85rem; color: #888; font-weight: 700; padding: 12px 0;">ยังไม่มีประวัติการพบกันโดยตรงในการแข่งขันอย่างเป็นทางการ</div>
        ` : `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>แมตช์ ID</th>
                  <th>ผลการแข่งขัน</th>
                  <th>สกอร์</th>
                  <th>ผู้ชนะ</th>
                  <th>วันที่</th>
                </tr>
              </thead>
              <tbody>
                ${h2hMatches.map(m => `
                  <tr>
                    <td><strong>${m.id}</strong></td>
                    <td>${m.serverAName} vs ${m.serverBName}</td>
                    <td><strong style="font-size: 1.1rem;">${m.scoreA} - ${m.scoreB}</strong></td>
                    <td><span class="badge-pill badge-verified">${m.winner === teamA.id || m.winner === teamA.name ? teamA.name : teamB.name}</span></td>
                    <td>${m.confirmedAt || 'จบแมตช์แล้ว'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  loadMatches() {
    return this.matches || [];
  }

  async saveMatches() {
    try {
      if (typeof supabase !== 'undefined' && supabase) {
        for (const match of this.matches) {
          await supabase.from('matches').upsert({
            id: match.id,
            data: match
          });
        }
        console.log("Matches saved to Supabase successfully.");
      }
    } catch (e) {
      console.error("Failed to save matches to Supabase:", e);
      localStorage.setItem("gaku_tournament_matches", JSON.stringify(this.matches));
    }
  }

  loadPlayoffMatches() {
    return this.playoffMatches || this.generateDefaultPlayoffBracket();
  }

  async savePlayoffMatches() {
    try {
      if (typeof supabase !== 'undefined' && supabase) {
        for (const match of this.playoffMatches) {
          await supabase.from('playoff_matches').upsert({
            id: match.id,
            data: match
          });
        }
        console.log("Playoff matches saved to Supabase successfully.");
      }
    } catch (e) {
      console.error("Failed to save playoff matches to Supabase:", e);
      localStorage.setItem("gaku_playoff_matches", JSON.stringify(this.playoffMatches));
    }
  }


  renderTeams() {
    const grid = document.getElementById("teams-grid");
    if (!grid) return;

    const totalCountEl = document.getElementById("stat-total-teams");
    const featuredBanner = document.getElementById("featured-team-banner");

    if (this.teams.length === 0) {
      if (totalCountEl) totalCountEl.textContent = "- TEAMS";
      if (featuredBanner) featuredBanner.style.display = "none";

      // Display empty state matching mockup 6.png
      grid.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">NO TEAMS AVAILABLE</h3>
          <p class="empty-state-desc">Public teams will appear here once they are verified or eliminated.</p>
        </div>
      `;
      return;
    }

    if (totalCountEl) totalCountEl.textContent = `${this.teams.length} TEAMS`;

    // Check featured team
    const verifiedTeam = this.teams.find(t => t.status === "verified");
    if (verifiedTeam && featuredBanner) {
      featuredBanner.style.display = "flex";
      const fLogo = document.getElementById("featured-logo-shield");
      const fName = document.getElementById("featured-name-text");
      const fServer = document.getElementById("featured-server-text");
      const fLink = document.getElementById("featured-link-btn");
      if (fLogo) fLogo.textContent = verifiedTeam.logoText || "TL";
      if (fName) fName.textContent = verifiedTeam.name;
      if (fServer) fServer.textContent = verifiedTeam.server;
      if (fLink) fLink.href = `#team/${verifiedTeam.id}`;
    } else if (featuredBanner) {
      featuredBanner.style.display = "none";
    }

    let filtered = this.teams.filter(t => {
      const matchFilter = this.currentFilter === "all" || t.status === this.currentFilter;
      const matchSearch = !this.searchQuery || 
        t.name.toLowerCase().includes(this.searchQuery) || 
        t.server.toLowerCase().includes(this.searchQuery);
      return matchFilter && matchSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">NO TEAMS FOUND</h3>
          <p class="empty-state-desc">No teams match your search or filter criteria.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map((t, idx) => {
      const num = String(idx + 1).padStart(2, '0');
      let badgeClass = "badge-verified";
      if (t.status === "pending") badgeClass = "badge-pending";
      if (t.status === "eliminated") badgeClass = "badge-eliminated";

      return `
        <div class="team-card" data-team-id="${t.id}">
          <div class="team-card-top">
            <div class="team-logo-shield pink-theme" style="overflow:hidden; padding:${t.logoUrl ? '0' : ''}">
              ${t.logoUrl
                ? `<img src="${t.logoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="${t.name} Logo">`
                : (t.logoText || t.name.slice(0, 2).toUpperCase())
              }
            </div>
            <span class="team-card-id">${num}</span>
          </div>
          <h3 class="team-card-name">${t.name}</h3>
          <p class="team-card-server">${t.server}</p>
          <div class="team-card-meta">
            ROSTER<br>
            <strong>15 STARTERS • UP TO ${t.subs ? t.subs.length : 0} SUBS</strong>
          </div>
          <div style="margin-bottom: 16px;">
            <span class="badge-pill ${badgeClass}">${t.status.toUpperCase()}</span>
          </div>
          <a href="#team/${t.id}" class="team-card-action">
            <span>VIEW TEAM →</span>
            <span>↗</span>
          </a>
        </div>
      `;
    }).join('');
  }

  renderTeamProfile(team) {
    const container = document.getElementById("view-team-profile");
    if (!container) return;

    // If no team specified, show generic mockup template matching 4.png
    if (!team) {
      team = {
        id: "template",
        name: "TEAM NAME",
        server: "SERVER NAME",
        status: "verified",
        logoText: "TL",
        starters: Array(15).fill("PLAYER NAME"),
        subs: [],
        matchHistory: []
      };
    }

    let badgeClass = "badge-verified";
    if (team.status === "pending") badgeClass = "badge-pending";
    if (team.status === "eliminated") badgeClass = "badge-eliminated";

    const startersHtml = (team.starters || Array(15).fill("PLAYER NAME")).map((name, i) => `
      <div class="player-slot-card">
        <div class="player-slot-tag">PLAYER ${String(i+1).padStart(2, '0')}</div>
        <h4 class="player-slot-name">${name}</h4>
        <span class="player-slot-role">PLAYER</span>
      </div>
    `).join('');

    const subsHtml = (team.subs && team.subs.length > 0) ? team.subs.map((name, i) => `
      <div class="player-slot-card">
        <div class="player-slot-tag">SUB ${String(i+1).padStart(2, '0')}</div>
        <h4 class="player-slot-name">${name}</h4>
        <span class="player-slot-role">PLAYER</span>
      </div>
    `).join('') : Array.from({ length: 5 }).map((_, i) => `
      <div class="player-slot-card">
        <div class="player-slot-tag">SUB ${String(i+1).padStart(2, '0')}</div>
        <h4 class="player-slot-name" style="color: var(--color-text-muted);">EMPTY SLOT</h4>
        <span class="player-slot-role">PLAYER</span>
      </div>
    `).join('');

    const matchHistoryHtml = (team.matchHistory && team.matchHistory.length > 0) ? team.matchHistory.map(m => `
      <tr>
        <td><strong>VS ${m.opponent}</strong></td>
        <td><span class="badge-pill ${m.result === 'WIN' ? 'badge-verified' : 'badge-eliminated'}">${m.result}</span></td>
        <td>${m.score}</td>
        <td>${m.date}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 36px 20px;">
          <div style="font-weight: 800; margin-bottom: 6px;">NO MATCH HISTORY</div>
          <div>Match results will appear once the team has played an official tournament match.</div>
        </td>
      </tr>
    `;

    container.innerHTML = `
      <div class="profile-hero">
        <div class="container">
          <div class="breadcrumb-nav">
            <a href="#teams">TEAMS</a> / <span>TEAM PROFILE</span>
          </div>
          <div class="profile-hero-inner">
            <div class="team-logo-shield" style="width: 80px; height: 80px; font-size: 1.25rem;">
              ${team.logoText || "TL"}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
                <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-light-muted);">${team.server}</span>
                <span class="badge-pill ${badgeClass}">${team.status.toUpperCase()}</span>
              </div>
              <h1 style="font-size: 2.2rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 6px;">${team.name}</h1>
              <p style="font-size: 0.8rem; font-weight: 700; letter-spacing: 0.1em; color: var(--color-brand); text-transform: uppercase;">KING OF GAKURAN 2026 | 15 VS 15 TOURNAMENT</p>
            </div>
          </div>
        </div>
      </div>

      <div class="stats-bar-grid">
        <div class="container" style="display: contents;">
          <div class="stat-bar-col">
            <div class="stat-bar-label">ROSTER</div>
            <div class="stat-bar-value">15 STARTERS</div>
            <div class="stat-bar-sub">UP TO 5 SUBS</div>
          </div>
          <div class="stat-bar-col">
            <div class="stat-bar-label">FORMAT</div>
            <div class="stat-bar-value">BEST OF 3</div>
            <div class="stat-bar-sub">SURVIVAL + 15V15</div>
          </div>
          <div class="stat-bar-col">
            <div class="stat-bar-label">ROUNDS</div>
            <div class="stat-bar-value">3 ROUNDS</div>
            <div class="stat-bar-sub">DECISIVE FINAL</div>
          </div>
          <div class="stat-bar-col">
            <div class="stat-bar-label">STATUS</div>
            <div class="stat-bar-value" style="color: var(--color-brand);">${team.status.toUpperCase()}</div>
            <div class="stat-bar-sub">VERIFIED</div>
          </div>
        </div>
      </div>

      <div class="container" style="padding-top: 48px; padding-bottom: 64px;">
        <!-- Team Information Overview Table -->
        <div style="margin-bottom: 48px;">
          <span class="section-tag">OFFICIAL ENTRY</span>
          <h2 class="section-title">TEAM INFORMATION</h2>
          <div class="table-wrap" style="margin-top: 16px;">
            <table class="data-table">
              <tbody>
                <tr>
                  <td style="font-weight: 700; width: 25%;">TEAM NAME</td>
                  <td>${team.name}</td>
                  <td style="font-weight: 700; width: 25%;">REGISTRATION STATUS</td>
                  <td><span class="badge-pill ${badgeClass}">${team.status.toUpperCase()}</span></td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">SERVER / COMMUNITY</td>
                  <td>${team.server}</td>
                  <td style="font-weight: 700;">ROSTER SIZE</td>
                  <td>15 STARTERS</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">TOURNAMENT</td>
                  <td>KING OF GAKURAN 2026</td>
                  <td style="font-weight: 700;">SUBSTITUTES</td>
                  <td>${team.subs ? team.subs.length : 0} PLAYERS</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">FORMAT</td>
                  <td>BEST OF 3</td>
                  <td style="font-weight: 700;">ENTRY FEE</td>
                  <td>${300 + (team.subs ? team.subs.length * 20 : 0)} THB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Starting Roster Section (15 Players) matching 4.png -->
        <div style="background: #FDF2F4; border-radius: var(--radius-md); padding: 32px; margin-bottom: 40px;">
          <span class="section-tag">TEAM LINEUP</span>
          <h2 class="section-title">STARTING ROSTER</h2>
          <p style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--color-brand); margin-bottom: 20px;">15 STARTING PLAYERS</p>
          <div class="roster-grid-5">
            ${startersHtml}
          </div>
        </div>

        <!-- Substitutes Section matching 4.png -->
        <div style="margin-bottom: 48px;">
          <span class="section-tag">ROSTER DEPTH</span>
          <h2 class="section-title">SUBSTITUTES</h2>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 16px;">UP TO 5 SUBSTITUTE PLAYERS</p>
          <div class="roster-grid-5">
            ${subsHtml}
          </div>
        </div>

        <!-- Match History Section matching 4.png -->
        <div style="margin-bottom: 48px;">
          <span class="section-tag">OFFICIAL RECORD</span>
          <h2 class="section-title">MATCH HISTORY</h2>
          <div class="table-wrap" style="margin-top: 16px;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>MATCH</th>
                  <th>OPPONENT</th>
                  <th>RESULT</th>
                  <th>DATE</th>
                </tr>
              </thead>
              <tbody>
                ${matchHistoryHtml}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 16px; justify-content: flex-end; padding-top: 24px; border-top: 1px solid var(--color-border-light);">
          <a href="#matches" class="btn btn-outline">VIEW MATCHES</a>
          <a href="#teams" class="btn btn-outline">BACK TO TEAMS</a>
          <a href="#register" class="btn btn-primary">REGISTER YOUR TEAM</a>
        </div>
      </div>
    `;
  }

  renderPlayers() {
    const list = document.getElementById("players-list");
    if (!list) return;

    let allPlayers = [];
    this.teams.forEach(t => {
      (t.starters || []).forEach((p, idx) => {
        allPlayers.push({
          id: `PL-${t.id.slice(-3)}-S${idx + 1}`,
          name: p,
          teamName: t.name,
          teamId: t.id,
          role: "STARTER",
          status: t.status
        });
      });
      (t.subs || []).forEach((p, idx) => {
        allPlayers.push({
          id: `PL-${t.id.slice(-3)}-B${idx + 1}`,
          name: p,
          teamName: t.name,
          teamId: t.id,
          role: "SUBSTITUTE",
          status: t.status
        });
      });
    });

    if (allPlayers.length === 0) {
      // Matching 7.png: NO PLAYERS AVAILABLE
      list.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">NO PLAYERS AVAILABLE</h3>
          <p class="empty-state-desc">Public player rosters will appear here once teams are registered and approved.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = allPlayers.map(p => `
      <div class="team-card">
        <div class="team-card-top">
          <div class="team-logo-shield pink-theme">${p.name.slice(0, 2).toUpperCase()}</div>
          <span class="team-card-id">${p.id}</span>
        </div>
        <h3 class="team-card-name" style="font-size: 1.1rem;">${p.name}</h3>
        <p class="team-card-server" style="margin-bottom: 8px;">${p.teamName}</p>
        <div style="margin-bottom: 12px;">
          <span class="badge-pill ${p.role === 'STARTER' ? 'badge-verified' : 'badge-pending'}">${p.role}</span>
        </div>
        <a href="#player/${p.id}" class="team-card-action">
          <span>VIEW PROFILE →</span>
          <span>↗</span>
        </a>
      </div>
    `).join('');
  }

  renderPlayerProfile(playerId) {
    const container = document.getElementById("view-player-profile");
    if (!container) return;

    let foundPlayer = null;
    let foundTeam = null;

    for (let t of this.teams) {
      let sIndex = (t.starters || []).findIndex((p, idx) => `PL-${t.id.slice(-3)}-S${idx + 1}` === playerId);
      if (sIndex !== -1) {
        foundPlayer = { id: playerId, name: t.starters[sIndex], role: "STARTER" };
        foundTeam = t;
        break;
      }
      let bIndex = (t.subs || []).findIndex((p, idx) => `PL-${t.id.slice(-3)}-B${idx + 1}` === playerId);
      if (bIndex !== -1) {
        foundPlayer = { id: playerId, name: t.subs[bIndex], role: "SUBSTITUTE" };
        foundTeam = t;
        break;
      }
    }

    // Default template matching 8.png
    if (!foundPlayer) {
      foundPlayer = { id: playerId || "PLAYER-0001", name: "PLAYER NAME", role: "STARTER" };
      foundTeam = { name: "TEAM NAME", server: "SERVER NAME", status: "verified", logoText: "T" };
    }

    container.innerHTML = `
      <div class="container" style="padding: 40px 24px 64px;">
        <span class="section-tag">PLAYER PROFILE</span>
        <h1 class="section-title">PLAYER PROFILE</h1>
        <p class="section-subtitle" style="margin-bottom: 32px;">VIEW PLAYER INFORMATION, TEAM AFFILIATION, ROSTER POSITION, AND TOURNAMENT PARTICIPATION.</p>

        <a href="#players" style="font-size: 0.75rem; font-weight: 800; color: var(--color-brand); text-transform: uppercase; margin-bottom: 24px; display: inline-block;">
          ← BACK TO PLAYERS
        </a>

        <!-- Player Header Hero matching 8.png -->
        <div style="background: var(--color-bg-dark); color: #fff; border-radius: var(--radius-md); padding: 36px; display: flex; align-items: center; gap: 32px; margin-bottom: 40px;">
          <div style="width: 110px; height: 110px; background: #FF2056; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 900;">
            PN
          </div>
          <div>
            <div style="font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; color: var(--color-brand); text-transform: uppercase; margin-bottom: 6px;">PLAYER</div>
            <h2 style="font-size: 2rem; font-weight: 900; text-transform: uppercase; margin-bottom: 8px;">${foundPlayer.name}</h2>
            <div style="font-size: 0.8rem; color: #9CA3AF; margin-bottom: 14px;">PLAYER ID: ${foundPlayer.id}</div>
            <div style="display: flex; gap: 8px;">
              <span class="badge-pill badge-verified">${foundPlayer.role}</span>
              <span class="badge-pill badge-verified">VERIFIED</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 32px; margin-bottom: 48px;">
          <!-- Player Info Table -->
          <div style="background: #fff; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 24px;">
            <h3 style="font-size: 1.1rem; font-weight: 800; text-transform: uppercase; margin-bottom: 16px;">PLAYER INFORMATION</h3>
            <table class="data-table">
              <tbody>
                <tr>
                  <td style="font-weight: 700; width: 40%;">PLAYER NAME</td>
                  <td>${foundPlayer.name}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">PLAYER ID</td>
                  <td>${foundPlayer.id}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">ROSTER POSITION</td>
                  <td>${foundPlayer.role}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">TEAM NAME</td>
                  <td>${foundTeam.name}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">SERVER NAME</td>
                  <td>${foundTeam.server}</td>
                </tr>
                <tr>
                  <td style="font-weight: 700;">TEAM STATUS</td>
                  <td><span class="badge-pill badge-verified">${foundTeam.status.toUpperCase()}</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Team Information Card matching 8.png -->
          <div style="background: #fff; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 24px; display: flex; flex-direction: column;">
            <h3 style="font-size: 1.1rem; font-weight: 800; text-transform: uppercase; margin-bottom: 16px;">TEAM INFORMATION</h3>
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
              <div class="team-logo-shield" style="width: 50px; height: 50px; font-size: 1.1rem; background: #000; color: #fff;">
                T
              </div>
              <div>
                <h4 style="font-size: 1.1rem; font-weight: 800; text-transform: uppercase;">${foundTeam.name}</h4>
                <p style="font-size: 0.75rem; color: var(--color-text-secondary);">${foundTeam.server}</p>
              </div>
            </div>
            <div style="margin-top: auto;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 0.8rem;">
                <span style="font-weight: 700;">TEAM STATUS</span>
                <span class="badge-pill badge-verified">${foundTeam.status.toUpperCase()}</span>
              </div>
              <a href="#teams" class="btn btn-primary" style="width: 100%;">VIEW TEAM ↗</a>
            </div>
          </div>
        </div>

        <!-- Tournament Participation -->
        <div style="background: #fff; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 24px; margin-bottom: 40px;">
          <h3 style="font-size: 1.1rem; font-weight: 800; text-transform: uppercase; margin-bottom: 16px;">TOURNAMENT PARTICIPATION</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">TOURNAMENT</div>
              <div style="font-size: 1rem; font-weight: 800;">KING OF GAKURAN</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">TEAM</div>
              <div style="font-size: 1rem; font-weight: 800;">${foundTeam.name}</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">ROSTER POSITION</div>
              <div style="font-size: 1rem; font-weight: 800;">${foundPlayer.role}</div>
            </div>
          </div>
        </div>

        <!-- Match History -->
        <div style="background: #fff; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); padding: 24px;">
          <h3 style="font-size: 1.1rem; font-weight: 800; text-transform: uppercase; margin-bottom: 16px;">MATCH HISTORY</h3>
          <div class="empty-state-card" style="margin: 0; padding: 40px 20px;">
            <p style="color: var(--color-text-muted); font-size: 0.85rem; font-weight: 700;">NO MATCH HISTORY</p>
          </div>
        </div>
      </div>
    `;
  }

  renderRankings() {
    const tbody = document.getElementById("ranking-table-body");
    if (!tbody) return;

    // Recalculate rankings from matches
    const sorted = this.computeRankings();

    if (!sorted || sorted.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 64px 20px;">
            <div style="font-size: 1.25rem; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">
              RANKING DATA UNAVAILABLE
            </div>
            <p style="color: var(--color-text-secondary); font-size: 0.85rem;">ยังไม่มีข้อมูลอันดับ ระบบจะคำนวณอันดับทันทีที่มีการแข่งขันรอบ Online เก็บแต้มและยืนยันผลแมตช์</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = sorted.map((t, idx) => {
      const rank = idx + 1;
      const rankStr = String(rank).padStart(2, '0');
      const matchW = t.stats?.won || 0;
      const matchL = t.stats?.lost || 0;
      const points = t.stats?.points || 0;
      const win20 = t.stats?.win20 || 0;
      const win21 = t.stats?.win21 || 0;

      // Status badge: Top 4 -> Upper Bracket, 5-8 -> Lower Bracket, >8 -> Eliminated
      let qualificationBadge = '';
      if (rank <= 4) {
        qualificationBadge = `<span class="badge-pill" style="background:#DBEAFE; color:#1E40AF; border:1px solid #BFDBFE; font-weight:800; font-size:0.75rem;">🔷 สายบน (UB)</span>`;
      } else if (rank <= 8) {
        qualificationBadge = `<span class="badge-pill" style="background:#FEF3C7; color:#B45309; border:1px solid #FDE68A; font-weight:800; font-size:0.75rem;">🔶 สายล่าง (LB)</span>`;
      } else {
        qualificationBadge = `<span class="badge-pill badge-eliminated" style="font-size:0.75rem;">ตกรอบ</span>`;
      }

      return `
        <tr>
          <td><strong style="font-size: 1.15rem; color: ${rank <= 4 ? '#1D4ED8' : (rank <= 8 ? '#D97706' : 'inherit')};">${rankStr}</strong></td>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="team-logo-shield pink-theme" style="width: 34px; height: 34px; font-size: 0.75rem; overflow: hidden; padding: ${t.logoUrl ? '0' : ''}">
                ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:100%;height:100%;object-fit:cover;" alt="Logo">` : (t.logoText || (t.name || '?').slice(0, 2).toUpperCase())}
              </div>
              <div>
                <a href="#team/${t.id}" style="font-weight: 800; text-transform: uppercase;">${t.name}</a>
                <div style="font-size: 0.7rem; color: var(--color-text-muted);">${t.server || 'Server'}</div>
              </div>
            </div>
          </td>
          <td style="text-align: center;"><strong style="color: #16a34a; font-size: 1rem;">${matchW}W</strong></td>
          <td style="text-align: center;"><span style="color: var(--color-text-muted); font-size: 1rem;">${matchL}L</span></td>
          <td style="text-align: right;">
            <div style="font-size: 1.3rem; color: var(--color-brand); font-weight: 900;">${points} PTS</div>
            <div style="font-size: 0.68rem; color: var(--color-text-muted); font-weight: 700;">
              ${win20 > 0 ? `2-0: ${win20} ครั้ง ` : ''}${win21 > 0 ? `2-1: ${win21} ครั้ง` : ''}${win20 === 0 && win21 === 0 ? (matchW > 0 ? `${matchW} ชนะ` : '0 ชนะ') : ''}
            </div>
          </td>
          <td style="text-align: center;">${qualificationBadge}</td>
        </tr>
      `;
    }).join('');

    // Render Date-by-Date Points Log
    this.renderRankingDateBreakdown();
  }

  renderRankingDateBreakdown() {
    const wrap = document.getElementById("ranking-date-breakdown-wrap");
    if (!wrap) return;

    const completedMatches = (this.matches || []).filter(m => m.status === 'COMPLETED');

    if (completedMatches.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state-card" style="padding: 40px 20px; text-align: center; margin: 0;">
          <p style="color: var(--color-text-muted); font-size: 0.9rem; font-weight: 700; margin: 0;">
            ยังไม่มีประวัติการแข่งที่ยืนยันผล เมื่อมีแมตช์แข่งขันเสร็จสิ้น รายละเอียดการได้แต้มจะแสดงที่นี่
          </p>
        </div>
      `;
      return;
    }

    // Build breakdown rows: Win 2-0 = 3 PTS, Win 2-1 = 2 PTS, Loss = 0 PTS
    let breakdownRows = [];
    completedMatches.forEach(m => {
      const matchDate = m.confirmedAt ? m.confirmedAt.split(' ')[0] : 'วันนี้';
      const scoreA = Number(m.scoreA) || 0;
      const scoreB = Number(m.scoreB) || 0;
      const isAWin = m.winner === m.serverAId || m.winner === m.serverAName || (scoreA > scoreB);
      const isBWin = m.winner === m.serverBId || m.winner === m.serverBName || (scoreB > scoreA);

      const ptsA = isAWin ? (scoreB === 0 ? 3 : 2) : 0;
      const ptsB = isBWin ? (scoreA === 0 ? 3 : 2) : 0;

      const noteA = isAWin ? (scoreB === 0 ? '(ชนะ 2-0: +3 PTS)' : '(ชนะ 2-1: +2 PTS)') : '(แพ้: 0 PTS)';
      const noteB = isBWin ? (scoreA === 0 ? '(ชนะ 2-0: +3 PTS)' : '(ชนะ 2-1: +2 PTS)') : '(แพ้: 0 PTS)';

      breakdownRows.push({
        date: matchDate,
        teamName: m.serverAName,
        opponent: m.serverBName,
        matchId: m.id,
        scoreText: `${scoreA} - ${scoreB}`,
        result: isAWin ? 'WIN' : 'LOSS',
        pts: ptsA,
        ptsNote: noteA,
        confirmedBy: m.confirmedBy || 'Official'
      });

      breakdownRows.push({
        date: matchDate,
        teamName: m.serverBName,
        opponent: m.serverAName,
        matchId: m.id,
        scoreText: `${scoreB} - ${scoreA}`,
        result: isBWin ? 'WIN' : 'LOSS',
        pts: ptsB,
        ptsNote: noteB,
        confirmedBy: m.confirmedBy || 'Official'
      });
    });

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 110px;">วันที่ (DATE)</th>
            <th>เซิร์ฟเวอร์ (SERVER)</th>
            <th>คู่แข่ง (OPPONENT)</th>
            <th style="text-align: center; width: 90px;">สกอร์รอบ</th>
            <th style="text-align: center; width: 90px;">ผลการแข่ง</th>
            <th style="text-align: right; width: 170px;">แต้มที่ได้</th>
          </tr>
        </thead>
        <tbody>
          ${breakdownRows.map(r => `
            <tr>
              <td><span style="font-family: monospace; font-size: 0.8rem; font-weight: 700;">${r.date}</span></td>
              <td><strong style="text-transform: uppercase;">${r.teamName}</strong></td>
              <td>VS ${r.opponent} <span style="font-size:0.75rem; color:#888;">(${r.matchId})</span></td>
              <td style="text-align: center; font-weight: 800;">${r.scoreText}</td>
              <td style="text-align: center;">
                <span class="badge-pill ${r.result === 'WIN' ? 'badge-verified' : 'badge-eliminated'}">${r.result}</span>
              </td>
              <td style="text-align: right;">
                <strong style="font-size: 1.1rem; color: ${r.pts > 0 ? 'var(--color-brand)' : 'var(--color-text-muted)'}; font-weight: 900;">+${r.pts} PTS</strong>
                <div style="font-size: 0.7rem; color: #888;">${r.ptsNote}</div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }


  renderMatches() {
    const list = document.getElementById("matches-list");
    if (!list) return;

    if (!this.matches || this.matches.length === 0) {
      list.innerHTML = `
        <div class="empty-state-card" style="padding: 72px 24px;">
          <h3 class="empty-state-title" style="font-size: 1.4rem; margin-bottom: 8px;">NO MATCHES FOUND</h3>
          <p class="empty-state-desc">Public tournament matches will appear once official matches are scheduled.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <div class="match-manage-grid">
        ${this.matches.map(m => {
          let badgeHtml = '<span class="match-status-badge badge-scheduled">SCHEDULED</span>';
          if (m.status === 'LIVE') badgeHtml = '<span class="match-status-badge badge-live">● LIVE NOW</span>';
          if (m.status === 'COMPLETED') badgeHtml = '<span class="match-status-badge badge-completed">✓ COMPLETED</span>';

          const scoreDisplay = `${m.scoreA || 0} - ${m.scoreB || 0}`;
          const winnerText = m.winner ? `🏆 Winner: ${m.winner === m.serverAId ? m.serverAName : m.serverBName}` : '';

          return `
            <div class="match-manage-card">
              <div class="match-manage-header">
                <strong style="font-size: 0.85rem; color: var(--color-text-muted);">${m.id}</strong>
                ${badgeHtml}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
                <div style="font-weight: 800; font-size: 1.1rem; text-transform: uppercase;">${m.serverAName}</div>
                <div style="font-size: 1.4rem; font-weight: 900; color: var(--color-brand); padding: 0 12px;">${scoreDisplay}</div>
                <div style="font-weight: 800; font-size: 1.1rem; text-transform: uppercase;">${m.serverBName}</div>
              </div>
              ${winnerText ? `<div style="font-size: 0.8rem; font-weight: 700; color: #16a34a; text-align: center;">${winnerText} ${m.winType ? `(${m.winType})` : ''}</div>` : ''}
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-border-light); padding-top: 12px; margin-top: auto;">
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">${m.confirmedAt || '15 VS 15 MATCH'}</span>
                <a href="#match-control" onclick="window.app.loadMatchIntoControl('${m.id}')" class="btn btn-outline" style="padding: 6px 14px; font-size: 0.75rem;">ENTER MATCH CONTROL →</a>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  initRegisterForm() {
    // Roster 15 generator
    const startersContainer = document.getElementById("starters-input-grid");
    if (startersContainer) {
      startersContainer.innerHTML = Array.from({ length: 15 }).map((_, i) => {
        const num = String(i + 1).padStart(2, '0');
        return `
          <div class="form-group">
            <label class="form-label">PLAYER ${num} <span class="req">*REQUIRED</span></label>
            <input type="text" class="form-input starter-name-input" placeholder="Player name" required>
          </div>
        `;
      }).join('');
    }

    // Helper to generate verification code
    const generateServerCode = (serverOrTeam = "GAKU") => {
      const cleanPrefix = (serverOrTeam || "GAKU")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 4)
        .toUpperCase() || "GAKU";
      const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const randNum = Math.floor(100 + Math.random() * 900);
      return `${cleanPrefix}-${letter}${randNum}`;
    };

    const ownerCodeInput = document.getElementById("reg-owner-code");
    const genCodeBtn = document.getElementById("reg-btn-gen-code");
    const serverNameInput = document.getElementById("reg-server-name");
    const teamNameInput = document.getElementById("reg-team-name");

    if (ownerCodeInput && !ownerCodeInput.value) {
      ownerCodeInput.value = generateServerCode();
    }

    if (genCodeBtn) {
      genCodeBtn.addEventListener("click", () => {
        const basis = serverNameInput?.value || teamNameInput?.value || "GAKU";
        if (ownerCodeInput) {
          ownerCodeInput.value = generateServerCode(basis);
        }
      });
    }

    if (serverNameInput) {
      serverNameInput.addEventListener("blur", () => {
        if (ownerCodeInput && (!ownerCodeInput.value || ownerCodeInput.value.startsWith("GAKU-"))) {
          if (serverNameInput.value.trim()) {
            ownerCodeInput.value = generateServerCode(serverNameInput.value.trim());
          }
        }
      });
    }

    // Dynamic fee calculator based on substitutes
    const subInputs = document.querySelectorAll(".sub-name-input");
    const updateFee = () => {
      let filledSubs = 0;
      subInputs.forEach(input => {
        if (input.value.trim().length > 0) filledSubs++;
      });
      const totalFee = 300;

      const subFeeEl = document.getElementById("calc-sub-fee");
      const subSidebarEl = document.getElementById("calc-sub-sidebar");
      const totalFeeEl = document.getElementById("calc-total-fee");
      const scanTotalEl = document.getElementById("scan-total-val");

      if (subFeeEl) subFeeEl.textContent = `FREE (0 THB)`;
      if (subSidebarEl) subSidebarEl.textContent = `FREE`;
      if (totalFeeEl) totalFeeEl.textContent = `${totalFee} THB`;
      if (scanTotalEl) scanTotalEl.textContent = `${totalFee} THB`;
    };

    subInputs.forEach(input => {
      input.addEventListener("input", updateFee);
    });

    // Team Logo Upload — Preview + store as base64
    this._pendingLogoUrl = null;
    const logoInput = document.getElementById("reg-team-logo");
    const logoPreviewShield = document.getElementById("reg-logo-preview");
    const logoFilename = document.getElementById("reg-logo-filename");
    if (logoInput) {
      logoInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          this._pendingLogoUrl = ev.target.result;
          if (logoPreviewShield) {
            logoPreviewShield.innerHTML = `<img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="Logo Preview">`;
          }
          if (logoFilename) {
            logoFilename.innerHTML = `<span style="color: var(--color-success); font-weight: 700;">✓ ${file.name}</span>`;
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Payment Slip Upload preview
    const slipUpload = document.getElementById("slip-file-input");
    const slipStatus = document.getElementById("slip-status-text");
    if (slipUpload && slipStatus) {
      slipUpload.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          slipStatus.innerHTML = `<span style="color: var(--color-success); font-weight: 800;">✓ EVIDENCE UPLOADED: ${e.target.files[0].name}</span>`;
        }
      });
    }

    // Form Submission
    const regForm = document.getElementById("team-register-form");
    if (regForm) {
      regForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const teamName = document.getElementById("reg-team-name")?.value.trim();
        const serverName = document.getElementById("reg-server-name")?.value.trim();
        const contact = document.getElementById("reg-team-contact")?.value.trim();
        const ownerCode = (document.getElementById("reg-owner-code")?.value.trim() || generateServerCode()).toUpperCase();
        const ownerName = document.getElementById("reg-owner-name")?.value.trim() || `Captain ${teamName}`;

        if (!teamName || !serverName) {
          alert("กรุณากรอกข้อมูล Team Name และ Server Name ให้ครบถ้วน");
          return;
        }

        if (!ownerCode) {
          alert("กรุณาระบุ SERVER OWNER VERIFICATION CODE");
          return;
        }

        const starterInputs = document.querySelectorAll(".starter-name-input");
        let starters = [];
        let missingStarters = false;

        starterInputs.forEach(input => {
          if (!input.value.trim()) missingStarters = true;
          else starters.push(input.value.trim());
        });

        if (missingStarters || starters.length < 15) {
          alert("ผู้เล่นตัวจริง (Starters) ต้องครบ 15 คนตามกฎการแข่งขัน");
          return;
        }

        let subs = [];
        subInputs.forEach(input => {
          if (input.value.trim()) subs.push(input.value.trim());
        });

        const newTeam = {
          id: `srv-${Date.now().toString().slice(-4)}`,
          name: teamName.toUpperCase(),
          server: serverName.toUpperCase(),
          owner: ownerName,
          verificationCode: ownerCode,
          contact: contact,
          status: "verified",
          logoText: teamName.slice(0, 2).toUpperCase(),
          logoUrl: this._pendingLogoUrl || null,
          registrationDate: new Date().toISOString().split('T')[0],
          rosterLocked: false,
          checkInStatus: "CHECKED_IN",
          starters: starters,
          subs: subs,
          playerCheckIns: Object.fromEntries(starters.map(s => [s, true])),
          matchHistory: [],
          disputes: [],
          notifications: [
            { id: `notif-${Date.now()}-1`, text: `ยินดีต้อนรับ ${teamName} เข้าสู่การแข่งขัน King of Gakuran`, read: false, time: "เมื่อสักครู่" },
            { id: `notif-${Date.now()}-2`, text: `รหัสผ่านเข้าสู่ระบบ Server Owner ของคุณคือ: ${ownerCode}`, read: false, time: "เมื่อสักครู่" }
          ],
          stats: { played: 0, won: 0, lost: 0, roundWon: 0, roundLost: 0, points: 0 }
        };

        this.teams.push(newTeam);
        this.saveTeams();
        this.addAuditLog(newTeam.owner, "REGISTER_TEAM", `ลงทะเบียนทีม ${newTeam.name} (${newTeam.server}) สำเร็จ พร้อมตั้งรหัส Server Owner: ${newTeam.verificationCode}`);

        // Update all related UI views
        try { this.renderTeams(); } catch(e) {}
        try { this.renderPlayers(); } catch(e) {}
        try { this.renderRankings(); } catch(e) {}
        try { this.populateMatchControlSelects(); } catch(e) {}
        try { this.populateServerCompareSelects(); } catch(e) {}
        try { this.renderServerOwnerPortal(); } catch(e) {}
        try { if (this.currentAdminTab) this.renderCurrentAdminTab(); } catch(e) {}

        // Show Success Modal with Server Owner Code
        const modal = document.getElementById("reg-success-modal");
        const modalServer = document.getElementById("reg-success-server");
        const modalCode = document.getElementById("reg-success-code");
        const copyBtn = document.getElementById("reg-copy-code-btn");
        const copyMsg = document.getElementById("reg-copy-success-msg");
        const goOwnerBtn = document.getElementById("reg-go-owner-btn");

        if (modal && modalServer && modalCode) {
          modalServer.textContent = `${newTeam.name} (${newTeam.server})`;
          modalCode.textContent = newTeam.verificationCode;
          if (copyMsg) copyMsg.style.display = "none";
          modal.style.display = "block";

          if (copyBtn) {
            copyBtn.onclick = () => {
              navigator.clipboard.writeText(newTeam.verificationCode).then(() => {
                if (copyMsg) copyMsg.style.display = "block";
                setTimeout(() => { if (copyMsg) copyMsg.style.display = "none"; }, 3000);
              }).catch(() => {
                alert(`รหัส Server Owner ของคุณคือ: ${newTeam.verificationCode}`);
              });
            };
          }

          if (goOwnerBtn) {
            goOwnerBtn.onclick = () => {
              modal.style.display = "none";
              window.location.hash = "#server-owner";
              setTimeout(() => {
                this.renderServerOwnerPortal();
                const sel = document.getElementById("owner-login-server-select");
                const codeInp = document.getElementById("owner-login-code");
                if (sel) sel.value = newTeam.id;
                if (codeInp) codeInp.value = newTeam.verificationCode;
              }, 60);
            };
          }
        } else {
          alert(`🎉 ลงทะเบียนทีม "${newTeam.name}" สำเร็จ!\n\n👑 รหัสเข้าใช้งาน SERVER OWNER LOGIN คือ:\n👉 ${newTeam.verificationCode}\n\nกรุณาใช้รหัสนี้เข้าสู่ระบบที่เมนู SERVER OWNER`);
          window.location.hash = "#server-owner";
        }
      });
    }
  }

  // ============================================================
  // ADMIN PANEL (One-Stop Data Architecture Control)
  // ============================================================
  initAdminPanel() {
    const ADMIN_PASSWORD = "15454";
    const loginScreen = document.getElementById("admin-login-screen");
    const dashboard = document.getElementById("admin-dashboard");
    const loginBtn = document.getElementById("admin-login-btn");
    const logoutBtn = document.getElementById("admin-logout-btn");
    const errorEl = document.getElementById("admin-login-error");
    const pwInput = document.getElementById("admin-password-input");
    const addTeamBtn = document.getElementById("admin-add-team-btn");
    const saveBtn = document.getElementById("admin-save-btn");
    const createMatchBtn = document.getElementById("admin-create-match-btn");
    const confirmCreateMatchBtn = document.getElementById("admin-confirm-create-match-btn");
    const clearLogsBtn = document.getElementById("admin-clear-logs-btn");
    const resetAllBtn = document.getElementById("admin-reset-all-btn");
    const playersSearchInput = document.getElementById("admin-players-search");

    // Check if already logged in (session)
    if (sessionStorage.getItem("gaku_admin_auth") === "ok") {
      if (loginScreen) loginScreen.style.display = "none";
      if (dashboard) dashboard.style.display = "block";
      this.renderCurrentAdminTab();
    } else {
      if (loginScreen) loginScreen.style.display = "flex";
      if (dashboard) dashboard.style.display = "none";
    }

    // Login button click
    if (loginBtn && !loginBtn._adminBound) {
      loginBtn._adminBound = true;
      loginBtn.addEventListener("click", () => {
        const pw = (pwInput?.value || "").trim();
        if (pw === ADMIN_PASSWORD) {
          sessionStorage.setItem("gaku_admin_auth", "ok");
          if (errorEl) errorEl.style.display = "none";
          if (loginScreen) loginScreen.style.display = "none";
          if (dashboard) dashboard.style.display = "block";
          this.addAuditLog("Admin", "LOGIN", "เข้าสู่ระบบ Admin Panel");
          this.renderCurrentAdminTab();
        } else {
          if (errorEl) errorEl.style.display = "block";
          if (pwInput) pwInput.value = "";
        }
      });
      if (pwInput) {
        pwInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") loginBtn.click();
        });
      }
    }

    // Logout
    if (logoutBtn && !logoutBtn._adminBound) {
      logoutBtn._adminBound = true;
      logoutBtn.addEventListener("click", () => {
        this.addAuditLog("Admin", "LOGOUT", "ออกจากระบบ Admin Panel");
        sessionStorage.removeItem("gaku_admin_auth");
        if (loginScreen) loginScreen.style.display = "flex";
        if (dashboard) dashboard.style.display = "none";
        if (pwInput) pwInput.value = "";
      });
    }

    // Admin Tab Navigation
    document.querySelectorAll(".admin-tab[data-tab]").forEach(tabBtn => {
      if (!tabBtn._tabBound) {
        tabBtn._tabBound = true;
        tabBtn.addEventListener("click", () => {
          document.querySelectorAll(".admin-tab[data-tab]").forEach(b => b.classList.remove("active"));
          tabBtn.classList.add("active");
          const targetTab = tabBtn.dataset.tab;
          this.currentAdminTab = targetTab;

          document.querySelectorAll(".admin-tab-content").forEach(panel => panel.classList.remove("active"));
          const targetPanel = document.getElementById(`admin-panel-${targetTab}`);
          if (targetPanel) targetPanel.classList.add("active");

          this.renderCurrentAdminTab();
        });
      }
    });

    // Add Server Button
    if (addTeamBtn && !addTeamBtn._adminBound) {
      addTeamBtn._adminBound = true;
      addTeamBtn.addEventListener("click", () => {
        this.openAdminModal(null);
      });
    }

    // Save Server Changes
    if (saveBtn && !saveBtn._adminBound) {
      saveBtn._adminBound = true;
      saveBtn.addEventListener("click", () => {
        this.adminSaveTeam();
      });
    }

    // Create Match Button
    if (createMatchBtn && !createMatchBtn._adminBound) {
      createMatchBtn._adminBound = true;
      createMatchBtn.addEventListener("click", () => {
        this.openCreateMatchModal();
      });
    }

    // Confirm Create Match
    if (confirmCreateMatchBtn && !confirmCreateMatchBtn._adminBound) {
      confirmCreateMatchBtn._adminBound = true;
      confirmCreateMatchBtn.addEventListener("click", () => {
        this.adminConfirmCreateMatch();
      });
    }

    // Clear Logs Button
    if (clearLogsBtn && !clearLogsBtn._adminBound) {
      clearLogsBtn._adminBound = true;
      clearLogsBtn.addEventListener("click", () => {
        this.clearAuditLogs();
      });
    }

    // Reset All Data Button
    if (resetAllBtn && !resetAllBtn._adminBound) {
      resetAllBtn._adminBound = true;
      resetAllBtn.addEventListener("click", () => {
        this.clearAllTournamentData();
      });
    }

    // Players Search
    if (playersSearchInput && !playersSearchInput._searchBound) {
      playersSearchInput._searchBound = true;
      playersSearchInput.addEventListener("input", (e) => {
        this.renderAdminPlayers(e.target.value.toLowerCase().trim());
      });
    }
  }

  renderCurrentAdminTab() {
    switch (this.currentAdminTab) {
      case "dashboard":
        this.renderAdminDashboard();
        break;
      case "servers":
        this.renderAdminTable();
        break;
      case "players":
        this.renderAdminPlayers();
        break;
      case "matches":
        this.renderAdminMatches();
        break;
      case "registrations":
        this.renderAdminRegistrations();
        break;
      case "audit":
        this.renderAuditLogs();
        break;
      default:
        this.renderAdminDashboard();
    }
  }

  renderAdminDashboard() {
    // 1. Calculate Stats
    const totalServers = this.teams.length;
    let totalPlayers = 0;
    this.teams.forEach(t => {
      totalPlayers += (t.starters || []).length + (t.subs || []).length;
    });

    const liveMatches = (this.matches || []).filter(m => m.status === 'LIVE').length;
    const completedMatches = (this.matches || []).filter(m => m.status === 'COMPLETED').length;

    const elServers = document.getElementById("admin-stat-servers");
    const elPlayers = document.getElementById("admin-stat-players");
    const elLive = document.getElementById("admin-stat-live");
    const elCompleted = document.getElementById("admin-stat-completed");

    if (elServers) elServers.textContent = totalServers;
    if (elPlayers) elPlayers.textContent = totalPlayers;
    if (elLive) elLive.textContent = liveMatches;
    if (elCompleted) elCompleted.textContent = completedMatches;

    // 2. Active & Upcoming Matches Preview
    const matchPreviewEl = document.getElementById("admin-dash-matches-preview");
    if (matchPreviewEl) {
      const activeList = (this.matches || []).slice(0, 3);
      if (activeList.length === 0) {
        matchPreviewEl.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.85rem;">ยังไม่มีรายการแข่งขัน คลิกแท็บ MATCHES เพื่อสร้างคู่แข่งขัน</p>';
      } else {
        matchPreviewEl.innerHTML = activeList.map(m => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #eee;">
            <div>
              <strong>${m.id}:</strong> ${m.serverAName} vs ${m.serverBName}
              <div style="font-size:0.75rem; color:#888;">Score: ${m.scoreA || 0} - ${m.scoreB || 0}</div>
            </div>
            <a href="#match-control" onclick="window.app.loadMatchIntoControl('${m.id}')" class="btn btn-outline" style="padding:4px 10px; font-size:0.75rem;">CONTROL ↗</a>
          </div>
        `).join('');
      }
    }

    // 3. Recent Audit Logs Preview
    const logsPreviewEl = document.getElementById("admin-dash-logs-preview");
    if (logsPreviewEl) {
      const recentLogs = (this.auditLogs || []).slice(0, 5);
      if (recentLogs.length === 0) {
        logsPreviewEl.innerHTML = '<p style="color:var(--color-text-muted);">ยังไม่มีประวัติการบันทึก</p>';
      } else {
        logsPreviewEl.innerHTML = recentLogs.map(l => `
          <div style="padding: 6px 0; border-bottom: 1px dashed #eee;">
            <span style="font-size:0.72rem; color:#888;">[${l.timestamp}]</span>
            <strong style="color:var(--color-brand); font-size:0.78rem;">${l.actor}:</strong>
            <span>${l.details}</span>
          </div>
        `).join('');
      }
    }
  }

  renderAdminTable() {
    const wrap = document.getElementById("admin-teams-wrap");
    if (!wrap) return;

    if (this.teams.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state-card" style="padding: 60px 24px;">
          <h3 class="empty-state-title">NO SERVERS REGISTERED</h3>
          <p class="empty-state-desc">ยังไม่มีเซิร์ฟเวอร์ที่ลงทะเบียน กด "+ ADD SERVER" เพื่อเพิ่มเซิร์ฟเวอร์ใหม่</p>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>SERVER NAME</th>
            <th>OWNER / CAPTAIN</th>
            <th>PLAYERS</th>
            <th>STATUS</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${this.teams.map((t, i) => {
            let badgeClass = "badge-verified";
            if (t.status === "pending") badgeClass = "badge-pending";
            if (t.status === "eliminated") badgeClass = "badge-eliminated";
            return `
              <tr>
                <td>${String(i + 1).padStart(2, '0')}</td>
                <td><strong style="text-transform:uppercase;">${t.name}</strong></td>
                <td>${t.owner || t.contact || t.server || '—'}</td>
                <td>${(t.starters || []).length} Starters + ${(t.subs || []).length} Subs</td>
                <td><span class="badge-pill ${badgeClass}">${(t.status || 'pending').toUpperCase()}</span></td>
                <td style="text-align:right;">
                  <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button class="btn btn-outline" style="padding: 6px 14px; font-size: 0.75rem;" onclick="window.app.openAdminModal('${t.id}')">✏️ EDIT</button>
                    <button class="btn" style="padding: 6px 14px; font-size: 0.75rem; background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA;" onclick="window.app.adminDeleteTeam('${t.id}')">🗑 DELETE</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderAdminPlayers(searchFilter = "") {
    const wrap = document.getElementById("admin-players-wrap");
    if (!wrap) return;

    let allPlayers = [];
    this.teams.forEach(team => {
      (team.starters || []).forEach((name, idx) => {
        allPlayers.push({
          name,
          teamId: team.id,
          teamName: team.name,
          role: `STARTER ${String(idx + 1).padStart(2, '0')}`,
          status: team.status
        });
      });
      (team.subs || []).forEach((name, idx) => {
        allPlayers.push({
          name,
          teamId: team.id,
          teamName: team.name,
          role: `SUBSTITUTE ${String(idx + 1).padStart(2, '0')}`,
          status: team.status
        });
      });
    });

    if (searchFilter) {
      allPlayers = allPlayers.filter(p => 
        p.name.toLowerCase().includes(searchFilter) || 
        p.teamName.toLowerCase().includes(searchFilter)
      );
    }

    if (allPlayers.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state-card" style="padding: 40px 24px;">
          <p class="empty-state-desc">ไม่พบข้อมูลผู้เล่นตามคำค้นหา</p>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>PLAYER NAME</th>
            <th>SERVER SQUAD</th>
            <th>ROSTER ROLE</th>
            <th>SERVER STATUS</th>
          </tr>
        </thead>
        <tbody>
          ${allPlayers.map((p, i) => `
            <tr>
              <td>${String(i + 1).padStart(2, '0')}</td>
              <td><strong>${p.name}</strong></td>
              <td><a href="#team/${p.teamId}" style="text-transform:uppercase; font-weight:700;">${p.teamName}</a></td>
              <td><span style="font-size:0.75rem; font-weight:700; color:var(--color-text-secondary);">${p.role}</span></td>
              <td><span class="badge-pill ${p.status === 'verified' ? 'badge-verified' : 'badge-pending'}">${p.status.toUpperCase()}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderAdminMatches() {
    const list = document.getElementById("admin-matches-list");
    if (!list) return;

    if (!this.matches || this.matches.length === 0) {
      list.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1 / -1; padding: 60px 24px;">
          <h3 class="empty-state-title">NO MATCHES SCHEDULED</h3>
          <p class="empty-state-desc">คลิกปุ่ม "+ CREATE MATCH" ด้านบนเพื่อจับคู่การแข่งขัน</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.matches.map(m => {
      let badgeHtml = '<span class="match-status-badge badge-scheduled">SCHEDULED</span>';
      if (m.status === 'LIVE') badgeHtml = '<span class="match-status-badge badge-live">● LIVE</span>';
      if (m.status === 'COMPLETED') badgeHtml = '<span class="match-status-badge badge-completed">✓ COMPLETED</span>';

      return `
        <div class="match-manage-card">
          <div class="match-manage-header">
            <strong style="font-size: 0.85rem; color: var(--color-text-muted);">${m.id}</strong>
            ${badgeHtml}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
            <div style="font-weight: 800; font-size: 1.1rem; text-transform: uppercase;">${m.serverAName}</div>
            <div style="font-size: 1.5rem; font-weight: 900; color: var(--color-brand); padding: 0 12px;">${m.scoreA || 0} - ${m.scoreB || 0}</div>
            <div style="font-weight: 800; font-size: 1.1rem; text-transform: uppercase;">${m.serverBName}</div>
          </div>
          ${m.winner ? `<div style="font-size:0.8rem; font-weight:700; color:#16a34a; text-align:center;">🏆 Winner: ${m.winner === m.serverAId ? m.serverAName : m.serverBName} (${m.winType || 'WIN'})</div>` : ''}
          <div style="display:flex; gap:8px; justify-content:space-between; border-top:1px solid var(--color-border-light); padding-top:12px; margin-top:auto;">
            <a href="#match-control" onclick="window.app.loadMatchIntoControl('${m.id}')" class="btn btn-primary" style="padding:6px 14px; font-size:0.75rem;">⚔️ MATCH CONTROL</a>
            <button onclick="window.app.adminDeleteMatch('${m.id}')" class="btn" style="padding:6px 10px; font-size:0.75rem; background:#FEE2E2; color:#B91C1C; border:1px solid #FECACA;">🗑</button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderAdminRegistrations() {
    const wrap = document.getElementById("admin-registrations-wrap");
    if (!wrap) return;

    const pendingTeams = this.teams.filter(t => t.status === "pending");

    if (pendingTeams.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state-card" style="padding: 60px 24px;">
          <h3 class="empty-state-title">NO PENDING REGISTRATIONS</h3>
          <p class="empty-state-desc">ไม่มีคำขอลงทะเบียนที่รอการตรวจสอบในขณะนี้</p>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>SERVER / TEAM</th>
            <th>CONTACT</th>
            <th>DATE</th>
            <th>STARTERS</th>
            <th style="text-align:right;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          ${pendingTeams.map((t, i) => `
            <tr>
              <td>${String(i + 1).padStart(2, '0')}</td>
              <td><strong>${t.name}</strong> (${t.server || 'Server'})</td>
              <td>${t.contact || '—'}</td>
              <td>${t.registrationDate || '—'}</td>
              <td>${(t.starters || []).length} / 15</td>
              <td style="text-align:right;">
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                  <button class="btn btn-primary" style="padding: 6px 14px; font-size: 0.75rem; background: #16a34a; border-color: #16a34a;" onclick="window.app.adminApproveTeam('${t.id}')">✓ APPROVE</button>
                  <button class="btn" style="padding: 6px 14px; font-size: 0.75rem; background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA;" onclick="window.app.adminDeleteTeam('${t.id}')">✕ REJECT</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderAuditLogs() {
    const tbody = document.getElementById("admin-audit-log-tbody");
    if (!tbody) return;

    if (!this.auditLogs || this.auditLogs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 40px; color: var(--color-text-muted);">
            ยังไม่มีประวัติในระบบ Audit Trail
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.auditLogs.map(l => {
      const isRef = l.actor && l.actor.includes('Referee');
      const actorBadge = isRef 
        ? `<span class="audit-actor-referee">${l.actor}</span>`
        : `<span class="audit-actor-admin">${l.actor}</span>`;

      return `
        <tr>
          <td><span style="font-family: monospace; font-size: 0.8rem; font-weight: 700;">${l.timestamp}</span></td>
          <td>${actorBadge}</td>
          <td><strong style="font-size: 0.8rem; color: #374151;">${l.action}</strong></td>
          <td><span style="font-size: 0.85rem;">${l.details}</span></td>
        </tr>
      `;
    }).join('');
  }

  openCreateMatchModal() {
    const modal = document.getElementById("admin-create-match-modal");
    if (!modal) return;

    const idInput = document.getElementById("admin-new-match-id");
    const selA = document.getElementById("admin-new-match-team-a");
    const selB = document.getElementById("admin-new-match-team-b");

    if (idInput) {
      idInput.value = `MATCH-#${String(this.matches.length + 1).padStart(3, '0')}`;
    }

    const opts = '<option value="">-- เลือกเซิร์ฟเวอร์ --</option>' +
      this.teams.map(t => `<option value="${t.id}">${t.name} (${t.server || 'Server'})</option>`).join('');

    if (selA) selA.innerHTML = opts;
    if (selB) selB.innerHTML = opts;

    modal.style.display = "block";
  }

  adminConfirmCreateMatch() {
    const idInput = document.getElementById("admin-new-match-id");
    const selA = document.getElementById("admin-new-match-team-a");
    const selB = document.getElementById("admin-new-match-team-b");

    const matchId = (idInput?.value || "").trim();
    const teamAId = selA?.value;
    const teamBId = selB?.value;

    if (!matchId || !teamAId || !teamBId) {
      alert("กรุณากรอก Match ID และเลือกเซิร์ฟเวอร์ทั้งสองฝ่าย");
      return;
    }

    if (teamAId === teamBId) {
      alert("กรุณาเลือกเซิร์ฟเวอร์ที่แตกต่างกัน");
      return;
    }

    const teamA = this.teams.find(t => t.id === teamAId);
    const teamB = this.teams.find(t => t.id === teamBId);

    const newMatch = {
      id: matchId,
      serverAId: teamA.id,
      serverBId: teamB.id,
      serverAName: teamA.name,
      serverBName: teamB.name,
      status: 'SCHEDULED',
      scoreA: 0,
      scoreB: 0,
      winner: null,
      rounds: [
        { number: 1, type: '15 VS 15', winner: null, status: 'WAITING' },
        { number: 2, type: '15 VS 15', winner: null, status: 'WAITING' },
        { number: 3, type: '15 VS 15 (DECISIVE)', winner: null, status: 'NOT PLAYED' }
      ]
    };

    this.matches.unshift(newMatch);
    this.saveMatches();
    this.addAuditLog("Admin", "CREATE_MATCH", `สร้างแมตช์ใหม่ ${newMatch.id}: ${teamA.name} VS ${teamB.name}`);

    document.getElementById("admin-create-match-modal").style.display = "none";
    this.renderAdminMatches();
    this.renderMatches();
    this.populateMatchControlSelects();
    alert(`✅ สร้างแมตช์ ${newMatch.id} เรียบร้อยแล้ว`);
  }

  adminDeleteMatch(matchId) {
    if (!confirm(`ต้องการลบแมตช์ ${matchId} หรือไม่?`)) return;
    this.matches = this.matches.filter(m => m.id !== matchId);
    this.saveMatches();
    this.computeRankings();
    this.renderRankings();
    this.renderMatches();
    this.renderAdminMatches();
    this.populateMatchControlSelects();
    this.addAuditLog("Admin", "DELETE_MATCH", `ลบแมตช์ ${matchId} ออกจากระบบ`);
  }

  adminApproveTeam(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return;
    team.status = "verified";
    this.saveTeams();
    this.addAuditLog("Admin", "APPROVE_TEAM", `อนุมัติทีม/เซิร์ฟเวอร์ "${team.name}" เข้าสู่การแข่งขัน`);
    this.renderAdminRegistrations();
    this.renderAdminTable();
    this.renderTeams();
    this.renderRankings();
    alert(`✅ อนุมัติทีม "${team.name}" เรียบร้อยแล้ว`);
  }

  openAdminModal(teamId) {
    const modal = document.getElementById("admin-edit-modal");
    const titleEl = document.getElementById("admin-modal-title");
    const idEl = document.getElementById("admin-edit-team-id");
    const nameEl = document.getElementById("admin-edit-name");
    const ownerEl = document.getElementById("admin-edit-owner");
    const statusEl = document.getElementById("admin-edit-status");
    const startersEl = document.getElementById("admin-edit-starters");
    const subsEl = document.getElementById("admin-edit-subs");

    if (!modal) return;

    if (teamId) {
      const team = this.teams.find(t => t.id === teamId);
      if (!team) return;
      if (titleEl) titleEl.textContent = `EDIT SERVER: ${team.name}`;
      if (idEl) idEl.value = teamId;
      if (nameEl) nameEl.value = team.name;
      if (ownerEl) ownerEl.value = team.owner || team.server || "";
      if (statusEl) statusEl.value = team.status;
      if (startersEl) startersEl.value = (team.starters || []).join("\n");
      if (subsEl) subsEl.value = (team.subs || []).join("\n");
    } else {
      // New team
      if (titleEl) titleEl.textContent = "ADD NEW SERVER";
      if (idEl) idEl.value = "";
      if (nameEl) nameEl.value = "";
      if (ownerEl) ownerEl.value = "";
      if (statusEl) statusEl.value = "verified";
      if (startersEl) startersEl.value = "";
      if (subsEl) subsEl.value = "";
    }

    modal.style.display = "block";
  }

  adminSaveTeam() {
    const idEl = document.getElementById("admin-edit-team-id");
    const nameEl = document.getElementById("admin-edit-name");
    const ownerEl = document.getElementById("admin-edit-owner");
    const statusEl = document.getElementById("admin-edit-status");
    const startersEl = document.getElementById("admin-edit-starters");
    const subsEl = document.getElementById("admin-edit-subs");

    const teamName = (nameEl?.value || "").trim().toUpperCase();
    const ownerName = (ownerEl?.value || "").trim();
    const status = statusEl?.value || "verified";
    const starters = (startersEl?.value || "").split("\n").map(s => s.trim()).filter(Boolean);
    const subs = (subsEl?.value || "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 5);

    if (!teamName) {
      alert("กรุณาใส่ชื่อเซิร์ฟเวอร์");
      return;
    }

    const teamId = idEl?.value || "";
    if (teamId) {
      // Edit existing
      const idx = this.teams.findIndex(t => t.id === teamId);
      if (idx !== -1) {
        this.teams[idx].name = teamName;
        this.teams[idx].owner = ownerName;
        this.teams[idx].server = ownerName || teamName;
        this.teams[idx].status = status;
        this.teams[idx].starters = starters;
        this.teams[idx].subs = subs;
        this.teams[idx].logoText = teamName.slice(0, 2);
        this.addAuditLog("Admin", "UPDATE_SERVER", `แก้ไขข้อมูลเซิร์ฟเวอร์ "${teamName}"`);
      }
    } else {
      // Add new
      const newServer = {
        id: `srv-${Date.now().toString().slice(-4)}`,
        name: teamName,
        owner: ownerName,
        server: ownerName || teamName,
        status: status,
        logoText: teamName.slice(0, 2),
        registrationDate: new Date().toISOString().split('T')[0],
        starters: starters.length > 0 ? starters : Array.from({ length: 15 }, (_, i) => `${teamName}_P${String(i+1).padStart(2,'0')}`),
        subs: subs,
        matchHistory: [],
        stats: { played: 0, won: 0, lost: 0, roundWon: 0, roundLost: 0, points: 0 }
      };
      this.teams.unshift(newServer);
      this.addAuditLog("Admin", "ADD_SERVER", `เพิ่มเซิร์ฟเวอร์ใหม่ "${teamName}"`);
    }

    this.saveTeams();
    this.computeRankings();
    this.renderAdminTable();
    this.renderTeams();
    this.renderRankings();
    this.renderPlayers();
    this.populateMatchControlSelects();
    document.getElementById("admin-edit-modal").style.display = "none";
    alert(`✅ บันทึกข้อมูลเซิร์ฟเวอร์ "${teamName}" เรียบร้อยแล้ว`);
  }

  adminDeleteTeam(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team) return;
    if (!confirm(`ลบเซิร์ฟเวอร์ "${team.name}" ออกจากระบบ? \n(ไม่สามารถกู้คืนได้)`)) return;
    this.teams = this.teams.filter(t => t.id !== teamId);
    this.saveTeams();
    this.addAuditLog("Admin", "DELETE_SERVER", `ลบเซิร์ฟเวอร์ "${team.name}" ออกจากระบบ`);
    this.computeRankings();
    this.renderAdminTable();
    this.renderTeams();
    this.renderRankings();
    this.renderPlayers();
    this.populateMatchControlSelects();
  }
}

// ============================================================
// FAILSAFE STANDALONE ROUTER
// Runs independently of TournamentApp to guarantee navigation
// works even if a render method throws an error
// ============================================================
(function() {
  function showView(viewId) {
    document.querySelectorAll(".view-section").forEach(function(s) {
      s.classList.remove("active");
    });
    var target = document.getElementById(viewId);
    if (target) {
      target.classList.add("active");
    }
    window.scrollTo(0, 0);
  }

  function handleRoute() {
    var hash = window.location.hash || "#home";
    var route = hash.split("?")[0];

    // Update nav active state
    document.querySelectorAll(".nav-link").forEach(function(link) {
      link.classList.remove("active");
      if (link.getAttribute("href") === route) {
        link.classList.add("active");
      }
    });

    // If TournamentApp is available, delegate to it
    if (window.app && typeof window.app.showView === "function") {
      if (route.startsWith("#team/")) {
        var teamId = route.replace("#team/", "");
        var team = window.app.teams.find(function(t) { return t.id === teamId; }) || null;
        try { window.app.renderTeamProfile(team); } catch(e) {}
        window.app.showView("view-team-profile");
        return;
      }
      if (route.startsWith("#player/")) {
        var playerId = route.replace("#player/", "");
        try { window.app.renderPlayerProfile(playerId); } catch(e) {}
        window.app.showView("view-player-profile");
        return;
      }
    }

    // Map routes to view IDs
    var routeMap = {
      "#home": "view-home",
      "#tournament": "view-tournament",
      "#playoff": "view-playoff",
      "#teams": "view-teams",
      "#compare": "view-compare",
      "#players": "view-players",
      "#matches": "view-matches",
      "#live": "view-live",
      "#ranking": "view-ranking",
      "#rules": "view-rules",
      "#register": "view-register",
      "#admin": "view-admin",
      "#server-owner": "view-server-owner",
      "#match-control": "view-match-control"
    };

    var viewId = routeMap[route] || "view-home";
    showView(viewId);

    // Trigger re-render on app if available
    if (window.app) {
      try {
        if (route === "#teams") window.app.renderTeams();
        if (route === "#players") window.app.renderPlayers();
        if (route === "#matches") window.app.renderMatches();
        if (route === "#ranking") window.app.renderRankings();
        if (route === "#playoff") window.app.renderPlayoffBracket();
        if (route === "#compare") window.app.renderServerCompare();
        if (route === "#server-owner") window.app.renderServerOwnerPortal();
        if (route === "#admin") window.app.initAdminPanel();
        if (route === "#match-control") window.app.populateMatchControlSelects();
      } catch(e) {
        console.warn("Re-render failed for route", route, e);
      }
    }
  }

  function initAppAndRouter() {
    // Initialize app if not already initialized
    try {
      if (!window.app) {
        window.app = new TournamentApp();
        window.clearAllTournamentData = function(skipConfirm) {
          if (window.app) window.app.clearAllTournamentData(skipConfirm);
        };
      }
    } catch(e) {
      console.error("TournamentApp init failed:", e);
    }

    // Navigation on hashchange
    window.addEventListener("hashchange", handleRoute);

    // Direct click binding on all anchor links with hashes
    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
      link.addEventListener("click", function() {
        const navMenu = document.querySelector(".nav-menu");
        if (navMenu && window.innerWidth <= 768) {
          navMenu.style.display = "none";
        }
        setTimeout(handleRoute, 10);
      });
    });

    // Initial route
    handleRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAppAndRouter);
  } else {
    initAppAndRouter();
  }
})();
