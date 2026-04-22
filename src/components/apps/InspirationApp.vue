<template>
  <div class="inspiration-app">
    <!-- Tab 切换 -->
    <div class="tab-header">
      <button :class="{ active: activeTab === 'discover' }" @click="activeTab = 'discover'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        发现
      </button>
      <button :class="{ active: activeTab === 'archive' }" @click="activeTab = 'archive'">
        <svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        归档
      </button>
    </div>

    <!-- 发现页 -->
    <div v-if="activeTab === 'discover'" class="tab-content">
      <!-- 搜索区域 -->
      <div class="search-section">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索灵感..."
            @keyup.enter="handleSearch"
            class="search-input"
          />
          <button v-if="searchQuery" @click="clearSearch" class="clear-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 搜索结果模式 -->
      <div v-if="isSearchMode" class="search-results">
        <div class="search-header">
          <span>搜索结果: "{{ searchQuery }}"</span>
          <button @click="clearSearch" class="back-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回
          </button>
        </div>
        
        <div v-if="searchResults.length === 0" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <p>未找到匹配的灵感</p>
        </div>
        
        <div v-else class="result-list">
          <div v-for="item in searchResults" :key="item.id" class="card" @click="openDetail(item)">
            <h3>{{ item.title }}</h3>
            <p class="card-desc">{{ item.description || '暂无描述' }}</p>
            <div class="card-tags">
              <span v-for="tag in (item.tags || []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="card-meta">
              <span v-if="getFolderName(item.folder_id)" class="folder-name">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {{ getFolderName(item.folder_id) }}
              </span>
              <span class="card-time">{{ formatTime(item.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 正常浏览模式 -->
      <template v-else>
        <div v-if="inspirations.length === 0" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          <p>还没有灵感，点击右下角+添加</p>
        </div>
        
        <div v-else>
          <!-- 换一换按钮 -->
          <div class="list-header">
            <span class="list-title">随机灵感</span>
            <button @click="shuffleRandom" class="shuffle-btn" :disabled="inspirations.length < 3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              换一换
            </button>
          </div>
          
          <!-- 随机灵感列表 -->
          <div class="list">
            <div v-for="item in randomInspirations" :key="item.id" class="card" @click="openDetail(item)">
              <h3>{{ item.title }}</h3>
              <p class="card-desc">{{ item.description || '暂无描述' }}</p>
              <div v-if="item.images && item.images.length > 0" class="card-images">
                <img v-for="(img, idx) in item.images.slice(0, 3)" :key="idx" :src="img" class="card-thumb" alt="" />
                <span v-if="item.images.length > 3">+{{ item.images.length - 3 }}</span>
              </div>
              <div class="card-tags">
                <span v-for="tag in (item.tags || []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
              </div>
              <div class="card-meta">
                <span v-if="getFolderName(item.folder_id)" class="folder-name">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  {{ getFolderName(item.folder_id) }}
                </span>
                <span class="card-time">{{ formatTime(item.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 新增按钮 -->
      <button @click="showAddForm = true" class="fab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>

    <!-- 归档页 -->
    <div v-if="activeTab === 'archive'" class="tab-content archive-content">
      <!-- 移动端：下拉选择文件夹 -->
      <div class="mobile-folder-select">
        <select v-model="selectedFolderId" class="folder-select">
          <option :value="null">全部灵感 ({{ inspirations.length }})</option>
          <option v-for="folder in folders" :key="folder.id" :value="folder.id">
            {{ folder.name }} ({{ getFolderCount(folder.id) }})
          </option>
        </select>
        <button @click="showAddFolder = true" class="add-folder-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          新建
        </button>
      </div>

      <!-- 新建文件夹表单 -->
      <div v-if="showAddFolder" class="folder-form">
        <input v-model="newFolderName" type="text" placeholder="文件夹名称" class="folder-input" @keyup.enter="createFolder" />
        <button @click="createFolder" class="confirm-btn">确认</button>
        <button @click="showAddFolder = false; newFolderName = ''" class="cancel-btn">取消</button>
      </div>

      <!-- 桌面端：左侧文件夹列表 -->
      <div class="desktop-sidebar">
        <div class="folder-section">
          <div class="folder-header">
            <h3>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              文件夹
            </h3>
            <button @click="showAddFolder = true" class="add-folder-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>

          <!-- 文件夹列表 -->
          <div class="folder-list">
            <div class="folder-item" :class="{ active: selectedFolderId === null }" @click="selectedFolderId = null">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              <span>全部灵感</span>
              <span class="count">{{ inspirations.length }}</span>
            </div>
            <div v-for="folder in folders" :key="folder.id" class="folder-item" :class="{ active: selectedFolderId === folder.id }">
              <div class="folder-info" @click="selectedFolderId = folder.id">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{{ folder.name }}</span>
              </div>
              <div class="folder-actions">
                <span class="count">{{ getFolderCount(folder.id) }}</span>
                <button @click.stop="deleteFolder(folder.id)" class="delete-folder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 灵感列表 -->
      <div class="folder-content">
        <h3>{{ selectedFolderId ? getFolderName(selectedFolderId) : '全部灵感' }}</h3>
        
        <div v-if="filteredInspirations.length === 0" class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-2.586a1 1 0 0 0-.707.293l-2.414 2.414a1 1 0 0 1-.707.293h-3.172a1 1 0 0 1-.707-.293l-2.414-2.414A1 1 0 0 0 6.586 13H4"/>
          </svg>
          <p>该文件夹暂无灵感</p>
        </div>
        
        <div v-else class="list">
          <div v-for="item in filteredInspirations" :key="item.id" class="card" @click="openDetail(item)">
            <h3>{{ item.title }}</h3>
            <p class="card-desc">{{ item.description || '暂无描述' }}</p>
            <div class="card-tags">
              <span v-for="tag in (item.tags || []).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="card-meta">
              <span class="card-time">{{ formatTime(item.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑表单弹窗 -->
    <div v-if="showAddForm" class="modal-overlay" @click.self="closeForm">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingItem ? '编辑灵感' : '新增灵感' }}</h3>
          <button @click="closeForm" class="close-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <form @submit.prevent="saveInspiration">
          <div class="form-group">
            <label>标题 *</label>
            <input v-model="formData.title" type="text" required placeholder="灵感标题" />
          </div>
          
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="formData.description" rows="3" placeholder="描述一下这个灵感..."></textarea>
          </div>
          
          <div class="form-group">
            <label>文件夹</label>
            <select v-model="formData.folder_id">
              <option value="">未分类</option>
              <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>图片（最多9张）</label>
            <div class="images-upload">
              <div v-for="(img, idx) in formData.images" :key="idx" class="image-preview">
                <img :src="img" alt="" />
                <button type="button" @click="removeImage(idx)" class="remove-img">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <label v-if="formData.images.length < 9" class="upload-btn">
                <input type="file" accept="image/*" @change="uploadImage" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </label>
            </div>
          </div>
          
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input v-model="formData.tagsInput" type="text" placeholder="工作, 学习, 生活..." />
          </div>
          
          <div v-if="formError" class="form-error">{{ formError }}</div>
          
          <div class="form-actions">
            <button type="button" @click="closeForm" class="cancel-btn">取消</button>
            <button type="submit" :disabled="isSaving" class="submit-btn">{{ isSaving ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetail" class="modal-overlay" @click.self="showDetail = false">
      <div class="detail-modal">
        <div class="modal-header">
          <h3>灵感详情</h3>
          <button @click="showDetail = false" class="close-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div class="detail-content">
          <h2>{{ detailItem.title }}</h2>
          
          <div class="detail-meta">
            <span v-if="getFolderName(detailItem.folder_id)" class="detail-folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              {{ getFolderName(detailItem.folder_id) }}
            </span>
            <span class="detail-time">{{ formatTime(detailItem.created_at) }}</span>
          </div>
          
          <p v-if="detailItem.description" class="detail-desc">{{ detailItem.description }}</p>
          
          <div v-if="detailItem.images && detailItem.images.length > 0" class="detail-images">
            <img v-for="(img, idx) in detailItem.images" :key="idx" :src="img" @click="previewImage(img)" alt="" />
          </div>
          
          <div v-if="detailItem.tags && detailItem.tags.length > 0" class="detail-tags">
            <span v-for="tag in detailItem.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
        
        <div class="detail-actions">
          <button @click="editInspiration" class="edit-btn">编辑</button>
          <button @click="deleteInspiration" class="delete-btn">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth.js'

const authStore = useAuthStore()

const CONFIG = {
  SB_URL: 'https://aciwugdxaijfqwslsdcp.supabase.co',
  SB_KEY: 'sb_publishable_MLilG8VNuMO52404-tfM8Q_iah12MFA',
  CL_NAME: 'dzgfl8jn4',
  CL_PRESET: 'brainPlus'
}

const activeTab = ref('discover')
const selectedFolderId = ref(null)
const inspirations = ref([])
const folders = ref([])
const searchResults = ref([])
const randomInspirations = ref([])
const isSearchMode = ref(false)

const showAddForm = ref(false)
const showAddFolder = ref(false)
const showDetail = ref(false)
const editingItem = ref(null)
const detailItem = ref({})
const newFolderName = ref('')
const isSaving = ref(false)
const formError = ref('')
const searchQuery = ref('')

const formData = ref({
  title: '',
  description: '',
  folder_id: '',
  images: [],
  tagsInput: ''
})

const sb = authStore.getClient()

const filteredInspirations = computed(() => {
  if (selectedFolderId.value === null) return inspirations.value
  return inspirations.value.filter(i => i.folder_id === selectedFolderId.value)
})

const getFolderName = (folderId) => folders.value.find(f => f.id === folderId)?.name || ''
const getFolderCount = (folderId) => inspirations.value.filter(i => i.folder_id === folderId).length

const formatTime = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString('zh-CN')
}

const shuffleRandom = () => {
  if (inspirations.value.length < 3) {
    randomInspirations.value = [...inspirations.value]
    return
  }
  const shuffled = [...inspirations.value].sort(() => 0.5 - Math.random())
  randomInspirations.value = shuffled.slice(0, 3)
}

const loadFolders = async () => {
  if (!authStore.user) return
  const { data, error } = await sb.from('bp_folders').select('*').eq('user_id', authStore.user.id).order('created_at', { ascending: false })
  if (!error) folders.value = data || []
}

const loadInspirations = async () => {
  if (!authStore.user) return
  const { data, error } = await sb.from('bp_inspirations').select('*').eq('user_id', authStore.user.id).order('created_at', { ascending: false })
  if (!error) {
    inspirations.value = data || []
    shuffleRandom()
  }
}

const handleSearch = async () => {
  if (!searchQuery.value.trim()) return
  isSearchMode.value = true
  const query = searchQuery.value.trim()
  
  const { data, error } = await sb.rpc('search_bp_inspirations', { search_query: query, user_uuid: authStore.user.id })
  
  if (!error) {
    searchResults.value = data || []
  } else {
    const { data: fallback } = await sb.from('bp_inspirations').select('*').eq('user_id', authStore.user.id).or(`title.ilike.%${query}%,description.ilike.%${query}%`).order('created_at', { ascending: false })
    searchResults.value = fallback || []
  }
}

const clearSearch = () => {
  searchQuery.value = ''
  isSearchMode.value = false
  searchResults.value = []
}

const createFolder = async () => {
  if (!newFolderName.value.trim()) return
  const { error } = await sb.from('bp_folders').insert([{ name: newFolderName.value.trim(), user_id: authStore.user.id }])
  if (!error) {
    newFolderName.value = ''
    showAddFolder.value = false
    await loadFolders()
  }
}

const deleteFolder = async (folderId) => {
  if (!confirm('确定删除该文件夹？文件夹内的灵感将变为未分类状态。')) return
  const { error } = await sb.from('bp_folders').delete().eq('id', folderId)
  if (!error) {
    if (selectedFolderId.value === folderId) selectedFolderId.value = null
    await loadFolders()
  }
}

const openDetail = (item) => { detailItem.value = { ...item }; showDetail.value = true }

const editInspiration = () => {
  showDetail.value = false
  editingItem.value = detailItem.value
  formData.value = {
    title: detailItem.value.title,
    description: detailItem.value.description || '',
    folder_id: detailItem.value.folder_id || '',
    images: [...(detailItem.value.images || [])],
    tagsInput: (detailItem.value.tags || []).join(', ')
  }
  showAddForm.value = true
}

const uploadImage = async (event) => {
  const file = event.target.files[0]
  if (!file) return
  try {
    const formDataUpload = new FormData()
    formDataUpload.append('file', file)
    formDataUpload.append('upload_preset', CONFIG.CL_PRESET)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.CL_NAME}/image/upload`, { method: 'POST', body: formDataUpload })
    const data = await res.json()
    if (data.secure_url) formData.value.images.push(data.secure_url)
  } catch (err) {
    formError.value = '图片上传失败'
  }
  event.target.value = ''
}

const removeImage = (index) => formData.value.images.splice(index, 1)

const saveInspiration = async () => {
  if (!formData.value.title.trim()) { formError.value = '请输入标题'; return }
  isSaving.value = true
  formError.value = ''
  
  const tags = formData.value.tagsInput.split(',').map(t => t.trim()).filter(t => t)
  const payload = {
    title: formData.value.title.trim(),
    description: formData.value.description.trim() || null,
    folder_id: formData.value.folder_id || null,
    images: formData.value.images,
    tags,
    user_id: authStore.user.id
  }
  
  let error
  if (editingItem.value) {
    const { error: err } = await sb.from('bp_inspirations').update(payload).eq('id', editingItem.value.id)
    error = err
  } else {
    const { error: err } = await sb.from('bp_inspirations').insert([payload])
    error = err
  }
  
  isSaving.value = false
  if (!error) { closeForm(); await loadInspirations() } else { formError.value = '保存失败：' + error.message }
}

const deleteInspiration = async () => {
  if (!confirm('确定删除该灵感？')) return
  const { error } = await sb.from('bp_inspirations').delete().eq('id', detailItem.value.id)
  if (!error) { showDetail.value = false; await loadInspirations() }
}

const closeForm = () => {
  showAddForm.value = false
  editingItem.value = null
  formData.value = { title: '', description: '', folder_id: '', images: [], tagsInput: '' }
  formError.value = ''
}

const previewImage = (url) => window.open(url, '_blank')

onMounted(async () => { if (authStore.user) await Promise.all([loadFolders(), loadInspirations()]) })
</script>

<style scoped>
.inspiration-app {
  height: 100%;
  background: #f8fafc;
  overflow-y: auto;
  position: relative;
}

/* Tab */
.tab-header {
  display: flex;
  background: white;
  padding: 0 16px;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.tab-header button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 20px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  position: relative;
}

.tab-icon { width: 18px; height: 18px; }

.tab-header button.active { color: #6366f1; }
.tab-header button.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #6366f1;
  border-radius: 3px 3px 0 0;
}

.tab-content { padding: 16px; padding-bottom: 80px; }

/* 搜索 */
.search-section { margin-bottom: 16px; }

.search-box {
  display: flex;
  align-items: center;
  background: white;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 14px;
  transition: border-color 0.2s;
}

.search-box:focus-within { border-color: #6366f1; }

.search-icon { width: 18px; height: 18px; color: #94a3b8; margin-right: 10px; flex-shrink: 0; }

.search-input { flex: 1; border: none; outline: none; font-size: 14px; background: transparent; }

.clear-search {
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.clear-search svg { width: 12px; height: 12px; }

/* 搜索结果 */
.search-results { animation: fadeIn 0.2s ease; }

.search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: #64748b;
  font-size: 13px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #64748b;
}

.back-btn svg { width: 14px; height: 14px; }

/* 列表头部 */
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.list-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.shuffle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  transition: all 0.2s;
}

.shuffle-btn svg { width: 14px; height: 14px; }
.shuffle-btn:hover { background: #e0e7ff; }
.shuffle-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 卡片列表 */
.list, .result-list { display: flex; flex-direction: column; gap: 10px; }

.card {
  background: white;
  padding: 14px;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.2s;
}

.card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); transform: translateY(-1px); }

.card h3 { font-size: 15px; color: #1e293b; margin-bottom: 6px; }

.card-desc {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-images { display: flex; gap: 6px; margin-bottom: 10px; }

.card-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 6px; }

.card-images span {
  width: 56px;
  height: 56px;
  background: #f1f5f9;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #64748b;
}

.card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }

.tag { background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 10px; font-size: 11px; }

.card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8; }

.folder-name {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #fef3c7;
  color: #b45309;
  padding: 3px 8px;
  border-radius: 6px;
}

.folder-name svg { width: 12px; height: 12px; }

/* 空状态 */
.empty-state { text-align: center; padding: 40px 20px; color: #94a3b8; }

.empty-icon { width: 48px; height: 48px; margin: 0 auto 12px; }

/* FAB */
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  transition: all 0.2s;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fab svg { width: 24px; height: 24px; }

.fab:hover { transform: scale(1.1); box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5); }

/* 归档页 */
.archive-content { 
  display: flex; 
  flex-direction: column; 
  gap: 12px;
}

/* 移动端：下拉选择 */
.mobile-folder-select {
  display: flex;
  gap: 8px;
  align-items: center;
}

.folder-select {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: #1e293b;
  cursor: pointer;
}

/* 桌面端：左侧边栏 */
.desktop-sidebar {
  display: none;
}

.folder-form { 
  display: flex; 
  gap: 6px; 
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.folder-input { 
  flex: 1; 
  min-width: 120px;
  padding: 8px 10px; 
  border: 1px solid #e2e8f0; 
  border-radius: 6px; 
  outline: none; 
  font-size: 13px; 
}

/* 桌面端布局 */
@media (min-width: 769px) {
  .archive-content {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 16px;
    min-height: calc(100vh - 120px);
  }
  
  .mobile-folder-select { display: none; }
  .desktop-sidebar { display: block; }
  
  .folder-section {
    background: white;
    border-radius: 12px;
    padding: 14px;
    height: fit-content;
    position: sticky;
    top: 60px;
  }
}

.folder-section { 
  background: white; 
  border-radius: 12px; 
  padding: 14px; 
  height: fit-content; 
}

.folder-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 12px; 
}

.folder-header h3 { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  font-size: 14px; 
  color: #1e293b; 
}

.folder-header h3 svg { width: 16px; height: 16px; }

.add-folder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: #6366f1;
  transition: background 0.2s;
}

.add-folder-btn svg { width: 14px; height: 14px; }
.add-folder-btn:hover { background: #e0e7ff; }

.folder-list { display: flex; flex-direction: column; gap: 2px; }

.folder-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
  color: #475569;
}

.folder-item svg { width: 16px; height: 16px; flex-shrink: 0; }
.folder-item:hover { background: #f8fafc; }
.folder-item.active { background: #e0e7ff; color: #6366f1; }

.folder-info { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  flex: 1;
  overflow: hidden;
}

.folder-info span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.folder-actions { display: flex; align-items: center; gap: 4px; }

.delete-folder {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.4;
  transition: opacity 0.2s;
  color: #ef4444;
}

.delete-folder svg { width: 14px; height: 14px; }
.delete-folder:hover { opacity: 1; }

.count { 
  background: #f1f5f9; 
  color: #64748b; 
  padding: 2px 6px; 
  border-radius: 8px; 
  font-size: 11px; 
  flex-shrink: 0;
}

.folder-item.active .count { background: #ddd6fe; }

.folder-content h3 { font-size: 16px; color: #1e293b; margin-bottom: 14px; }

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-content, .detail-modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}

.detail-modal { max-width: 560px; }

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header h3 { font-size: 16px; color: #1e293b; }

.close-btn {
  background: #f1f5f9;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.2s;
}

.close-btn svg { width: 14px; height: 14px; }
.close-btn:hover { background: #e2e8f0; }

/* 表单 */
.modal-content form { padding: 16px 20px; }

.form-group { margin-bottom: 16px; }

.form-group label { display: block; font-size: 13px; color: #64748b; margin-bottom: 6px; }

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus { border-color: #6366f1; }

/* 图片上传 */
.images-upload { display: flex; flex-wrap: wrap; gap: 8px; }

.image-preview { position: relative; width: 72px; height: 72px; }

.image-preview img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }

.remove-img {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.remove-img svg { width: 10px; height: 10px; }

.upload-btn {
  width: 72px;
  height: 72px;
  background: #f8fafc;
  border: 2px dashed #e2e8f0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-btn input { display: none; }
.upload-btn svg { width: 20px; height: 20px; color: #94a3b8; }
.upload-btn:hover { border-color: #6366f1; }

.form-error { color: #ef4444; font-size: 13px; margin-bottom: 12px; }

.form-actions { display: flex; gap: 10px; justify-content: flex-end; }

.confirm-btn, .submit-btn { background: #6366f1; color: white; padding: 10px 18px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }

.cancel-btn { background: #f1f5f9; color: #64748b; padding: 10px 18px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }

/* 详情 */
.detail-content { padding: 16px 20px; }

.detail-content h2 { font-size: 20px; color: #1e293b; margin-bottom: 10px; }

.detail-meta { display: flex; gap: 10px; margin-bottom: 14px; font-size: 12px; color: #64748b; }

.detail-folder {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #fef3c7;
  color: #b45309;
  padding: 3px 8px;
  border-radius: 6px;
}

.detail-folder svg { width: 12px; height: 12px; }

.detail-desc { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 14px; }

.detail-images { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }

.detail-images img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer; transition: transform 0.2s; }
.detail-images img:hover { transform: scale(1.02); }

.detail-tags { display: flex; flex-wrap: wrap; gap: 6px; }

.detail-actions { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid #f1f5f9; }

.edit-btn { flex: 1; background: #6366f1; color: white; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }

.delete-btn { flex: 1; background: #fee2e2; color: #ef4444; padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

/* 响应式 */
@media (max-width: 480px) {
  .tab-content { padding: 12px; padding-bottom: 70px; }
  .tab-header button { padding: 12px 14px; font-size: 13px; }
  .fab { bottom: 20px; right: 20px; width: 48px; height: 48px; }
  .detail-images { grid-template-columns: repeat(2, 1fr); }
}
</style>
