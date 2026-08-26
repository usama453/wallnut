(() => {
  "use strict";

  /* ---------- Config & Supabase init ---------- */
  const supabaseUrl = window.SUPABASE_URL;
  const supabaseAnonKey = window.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Social Wall: Set SUPABASE_URL and SUPABASE_ANON_KEY (see config.js and README).");
  }

  const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSessionInLocalStorage: true,
      detectSessionInUrl: true,
    },
  });

  /* ---------- DOM elements ---------- */
  const postsMain = document.getElementById("postsMain");
  const searchInput = document.getElementById("searchInput");
  const authModal = document.getElementById("authModal");
  const postModal = document.getElementById("postModal");
  const imageInput = document.getElementById("imageInput");
  const captionInput = document.getElementById("captionInput");
  const postIdHidden = document.getElementById("postId");
  const actionHidden = document.getElementById("action");
  const postSubmitBtn = document.getElementById("postSubmitBtn");

  /* ---------- State ---------- */
  let user = null;
  let allPosts = []; // raw posts from DB

  /* ---------- Auth UI helpers ---------- */

  function showAuthModal(showSignUp = false) {
    authModal.style.display = "flex";
    const title = document.getElementById("authModalTitle");
    title.textContent = showSignUp ? "Create Account" : "Sign in to Social Wall";

    const formsDiv = document.getElementById("authForms");
    formsDiv.innerHTML = `
      <h3 style="margin:0 0 12px; text-align:center; color:var(--muted);">${showSignUp ? "Create Account" : "Sign in"}</h3>
      <input type="email" id="authEmail" placeholder="email@example.com" autocomplete="email" required />
      <input type="password" id="authPassword" placeholder="password" required />
      <button id="authSubmit" class="btn btn-primary" style="width:100%;margin-top:8px;">${showSignUp ? "Create Account" : "Sign in"}</button>
      <button id="toggleAuthMode" style="width:100%;margin-top:6px;font-size:13px;background:transparent;border:none;color:var(--muted);cursor:pointer;">${showSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}</button>
    `;

    document.getElementById("authSubmit").onclick = showSignUp ? handleSignUp : handleSignIn;
    document.getElementById("toggleAuthMode").onclick = () => showAuthModal(!showSignUp);
  }

  function hideAuthModal() { authModal.style.display = "none"; }

  async function handleSignIn() {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    if (!email || !password) return alert("Enter email and password");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message || "Sign in failed");
    hideAuthModal();
  }

  async function handleSignUp() {
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();
    if (!email || !password) return alert("Enter email and password");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message || "Sign up failed");
    handleSignIn();
  }

  /* ---------- Session / auth state ---------- */

  // Single handler covering SIGNED_IN, SIGNED_OUT
  supabase.auth.onAuthStateChange((event, session) => {
    user = session?.user ?? null;

    if (event === "SIGNED_IN") {
      fetchAllPosts().then(posts => { allPosts = posts || []; renderPosts(); });
      if (authModal) authModal.style.display = "none";
    }
    if (event === "SIGNED_OUT") {
      allPosts = [];
      postsMain.innerHTML = "";
      if (authModal) { authModal.style.display = "flex"; showAuthModal(false); }
    }
  });

  async function fetchAllPosts() {
    const { data, error } = await supabase
      .from("posts").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  // Startup: check session and load posts
  supabase.auth.getSession().then(({ data: { session } }) => {
    user = session?.user ?? null;
    if (user) {
      fetchAllPosts().then(posts => { allPosts = posts; renderPosts(); });
      if (authModal) authModal.style.display = "none";
    } else {
      showAuthModal(false);
    }
  });

  /* ---------- Posts CRUD ---------- */

  async function createPost(imageUrl, imagePath, caption) {
    if (!user) return alert("User not authenticated");
    const { data, error } = await supabase
      .from("posts").insert({ user_id: user.id, image_url: imageUrl, image_path: imagePath, caption }).select().single();
    if (error) { console.error(error); return null; }
    return data;
  }

  async function updatePost(id, imageUrl, imagePath, caption) {
    if (!user) return alert("User not authenticated");
    const { error } = await supabase
      .from("posts").update({ image_url: imageUrl, image_path: imagePath, caption }).eq("id", id).eq("user_id", user.id);
    if (error) { console.error(error); return false; }
    return true;
  }

  async function deletePost(id, imagePath) {
    if (!confirm("Delete this post?")) return;
    if (imagePath) await supabase.storage.from("post-images").remove([imagePath]);
    const { error } = await supabase.from("posts").delete().eq("id", id).eq("user_id", user.id);
    if (error) { console.error(error); alert("Failed to delete from DB"); return; }
    renderPosts();
  }

  /* ---------- Render posts ---------- */

  function renderPosts(filterCaption = "") {
    if (allPosts.length === 0) {
      fetchAllPosts().then(posts => { allPosts = posts; renderPosts(filterCaption); });
      return;
    }

    const filtered = allPosts.filter(p => p.caption.toLowerCase().includes(filterCaption.toLowerCase()));

    if (filtered.length === 0) {
      postsMain.innerHTML = '<div class="empty-state"><span class="emoji">📱</span><h3>No posts yet</h3><p>Add your first post.</p></div>';
      return;
    }

    postsMain.innerHTML = filtered.map(p => {
      const date = new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const truncated = p.caption.length > 50 ? p.caption.substring(0, 50) + "…" : p.caption;
      const actions = `
        <div class="post-actions">
          <button class="btn-small primary" onclick="window.copyCaption('${escapeHtml(p.caption)}')">Copy</button>
          <button class="btn-small" onclick="window.downloadImage('${p.image_url}')">Download</button>
          <button class="btn-small" onclick="window.editPost(document.querySelector(\`.post-card[data-id="${p.id}"]`))">Edit</button>
          <button class="btn-small danger" onclick="window.deletePost('${p.id}', '${p.image_path}')">Delete</button>
        </div>`;
      return `<article class="post-card" data-id="${p.id}" data-image-url="${p.image_url}" data-image-path="${p.image_path}">
        <img class="post-image" src="${p.image_url}" alt="Post" loading="lazy" onerror="this.style.display='none'"/>
        <div class="post-caption">${truncated}</div>
        <div class="post-meta"><span class="date">${date}</span></div>
        ${actions}</article>`;
    }).join('');

    attachPostListeners();
  }

  function attachPostListeners() {
    document.querySelectorAll('.post-caption').forEach(el => el.addEventListener('click', () => el.classList.toggle('expanded')));
    document.querySelectorAll('.post-card .btn-small.danger').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); const c = btn.closest('.post-card'); deletePost(c.dataset.id, c.dataset.imagePath); };
    });
    document.querySelectorAll('.post-card .btn-small.primary').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); window.editPost(btn.closest('.post-card')); };
    });
  }

  /* ---------- Add / Edit post modal ---------- */

  window.openPostModal = function(initData = null) {
    postModal.style.display = "flex";
    const title = document.getElementById("postModalTitle");
    if (initData && initData.action === "edit") {
      title.textContent = "Edit Post";
      actionHidden.value = "edit";
      postIdHidden.value = initData.id;
      captionInput.value = initData.caption || "";
      document.getElementById("imagePreview").innerHTML = `<img src="${initData.imageUrl}" alt="Current" style="max-width:100%;max-height:150px;border-radius:8px;border:1px solid var(--border);" /><p style="font-size:11px;color:var(--muted);margin-top:4px;">Current image</p>`;
      document.getElementById("imageInput").disabled = false;
    } else {
      title.textContent = "Add Post";
      actionHidden.value = "create";
      postIdHidden.value = "";
      captionInput.value = "";
      document.getElementById("imagePreview").innerHTML = "";
      document.getElementById("imageInput").disabled = false;
      imageInput.value = "";
    }
  };

  window.hidePostModal = function() {
    postModal.style.display = "none";
    document.getElementById("postForm").reset();
    document.getElementById("imagePreview").innerHTML = "";
    document.getElementById("imageInput").disabled = false;
  };

  imageInput.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview" style="max-width:100%;max-height:200px;object-fit:cover;border-radius:8px;border:1px solid var(--border);" />`;
    const ext = file.name.split('.').pop();
    const name = `post-${Date.now()}.${ext}`;
    const path = `posts/${user?.id}/${name}`;
    const { error } = await supabase.storage.from("post-images").upload(path, file, { cacheControl: '3600' });
    if (error) { alert("Upload failed: " + error.message); preview.innerHTML = ""; return; }
    const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(path);
    const { error: dbError } = await supabase.from("posts").insert({ user_id: user.id, image_url: urlData.publicUrl, image_path: path, caption: captionInput.value.trim() });
    if (dbError) { alert("Save failed: " + dbError.message); return; }
    hidePostModal(); renderPosts();
  };

  window.openEditPost = function(card) {
    const id = card.dataset.id;
    const post = allPosts.find(p => p.id === id);
    if (!post) return;
    openPostModal({ action: "edit", id: post.id, imageUrl: post.image_url, caption: post.caption });
  };

  document.getElementById("postForm").onsubmit = async e => {
    e.preventDefault();
    const action = actionHidden.value, id = postIdHidden.value, caption = captionInput.value.trim(), imageFile = imageInput.files?.[0];
    let imageUrl, imagePath;
    if (action === "edit") {
      const post = allPosts.find(p => p.id === id);
      if (!post) return;
      if (imageFile) {
        await supabase.storage.from("post-images").remove([post.image_path]);
        const ext = imageFile.name.split('.').pop(), name = `post-${Date.now()}.${ext}`, newPath = `posts/${user.id}/${name}`;
        const { error: uplErr } = await supabase.storage.from("post-images").upload(newPath, imageFile);
        if (uplErr) return alert("Upload failed: " + uplErr.message);
        const { data: ud } = supabase.storage.from("post-images").getPublicUrl(newPath);
        imageUrl = ud.publicUrl; imagePath = newPath;
      } else { imageUrl = post.image_url; imagePath = post.image_path; }
      const ok = await updatePost(id, imageUrl, imagePath, caption);
      if (ok) alert("Post updated");
    } else {
      if (!imageFile) return alert("Image required");
      const ext = imageFile.name.split('.').pop(), name = `post-${Date.now()}.${ext}`, path = `posts/${user.id}/${name}`;
      const { error: uplErr } = await supabase.storage.from("post-images").upload(path, imageFile);
      if (uplErr) return alert("Upload failed: " + uplErr.message);
      const { data: ud } = supabase.storage.from("post-images").getPublicUrl(path);
      imageUrl = ud.publicUrl; imagePath = path;
      const { error: dbErr } = await supabase.from("posts").insert({ user_id: user.id, image_url: imageUrl, image_path: path, caption });
      if (dbErr) return alert("Save failed: " + dbErr.message);
    }
    hidePostModal(); renderPosts();
  };

  /* ---------- Copy caption ---------- */
  window.copyCaption = function(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    else { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  };

  /* ---------- Download image ---------- */
  window.downloadImage = function(url) {
    const a = document.createElement('a'); a.href = url; a.download = ""; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  /* ---------- Search ---------- */
  searchInput.addEventListener('input', e => renderPosts(e.target.value));

  /* ---------- Init ---------- */
  window.copyCaption = window.copyCaption; window.downloadImage = window.downloadImage;
  window.editPost = window.openEditPost; window.deletePost = window.deletePost;
  window.openPostModal = window.openPostModal; window.hidePostModal = window.hidePostModal;
})();