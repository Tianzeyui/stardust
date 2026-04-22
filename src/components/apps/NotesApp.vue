<template>
  <div class="notes-app">
    <div class="sidebar">
      <div class="sidebar-header">
        <button @click="createNote" class="new-note-btn">+ 新建笔记</button>
      </div>
      <div class="notes-list">
        <div 
          v-for="note in notes" 
          :key="note.id" 
          class="note-item"
          :class="{ active: selectedNoteId === note.id }"
          @click="selectNote(note.id)"
        >
          <div class="note-title">{{ note.title || '无标题' }}</div>
          <div class="note-date">{{ formatDate(note.updatedAt) }}</div>
        </div>
      </div>
    </div>
    <div class="editor">
      <input 
        v-model="currentNote.title" 
        @input="saveNotes"
        placeholder="笔记标题"
        class="title-input"
      />
      <textarea 
        v-model="currentNote.content" 
        @input="saveNotes"
        placeholder="开始输入..."
        class="content-input"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const notes = ref([])
const selectedNoteId = ref(null)

const currentNote = computed(() => {
  return notes.value.find(n => n.id === selectedNoteId.value) || { title: '', content: '' }
})

const createNote = () => {
  const newNote = {
    id: Date.now(),
    title: '',
    content: '',
    updatedAt: new Date().toISOString()
  }
  notes.value.unshift(newNote)
  selectedNoteId.value = newNote.id
  saveNotes()
}

const selectNote = (id) => {
  selectedNoteId.value = id
}

const saveNotes = () => {
  if (selectedNoteId.value) {
    const note = notes.value.find(n => n.id === selectedNoteId.value)
    if (note) {
      note.updatedAt = new Date().toISOString()
    }
  }
  localStorage.setItem('notes', JSON.stringify(notes.value))
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

onMounted(() => {
  const saved = localStorage.getItem('notes')
  if (saved) {
    notes.value = JSON.parse(saved)
    if (notes.value.length > 0) {
      selectedNoteId.value = notes.value[0].id
    }
  } else {
    createNote()
  }
})
</script>

<style scoped>
.notes-app {
  height: 100%;
  display: flex;
  background: white;
}

.sidebar {
  width: 250px;
  background: #f8f9fa;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.new-note-btn {
  width: 100%;
  padding: 10px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.new-note-btn:hover {
  background: #45a049;
}

.notes-list {
  flex: 1;
  overflow-y: auto;
}

.note-item {
  padding: 15px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.note-item:hover {
  background: #f0f0f0;
}

.note-item.active {
  background: #e3f2fd;
}

.note-title {
  font-weight: bold;
  margin-bottom: 4px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-date {
  font-size: 12px;
  color: #999;
}

.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.title-input {
  padding: 20px;
  font-size: 24px;
  border: none;
  border-bottom: 1px solid #e0e0e0;
  outline: none;
  font-weight: 500;
}

.content-input {
  flex: 1;
  padding: 20px;
  border: none;
  resize: none;
  font-size: 16px;
  outline: none;
  font-family: inherit;
  line-height: 1.6;
}
</style>
