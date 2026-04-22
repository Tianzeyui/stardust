<template>
  <div class="terminal">
    <div class="output">
      <div class="line">Brain Plus Terminal [Version 1.0.0]</div>
      <div class="line">(c) 2026 Brain Plus Corporation.</div>
      <div class="line spacer"></div>
      <div 
        v-for="(line, index) in lines" 
        :key="index" 
        class="line"
        :style="{ color: line.color }"
      >
        {{ line.text }}
      </div>
    </div>
    <div class="input-line">
      <span class="prompt">C:\Users\BrainPlus&gt;</span>
      <input 
        v-model="currentCommand" 
        @keyup.enter="executeCommand"
        placeholder=""
        autofocus
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const currentCommand = ref('')
const lines = ref([
  { text: '输入 "help" 查看可用命令', color: '#ffff00' }
])

const executeCommand = () => {
  const cmd = currentCommand.value.trim().toLowerCase()
  
  // 显示用户输入
  lines.value.push({ 
    text: `C:\\Users\\BrainPlus> ${currentCommand.value}`, 
    color: '#fff' 
  })
  
  // 处理命令
  if (cmd === 'help') {
    lines.value.push({ text: '可用命令: help, clear, date, whoami, echo', color: '#0ff' })
  } else if (cmd === 'clear') {
    lines.value = []
  } else if (cmd === 'date') {
    lines.value.push({ text: new Date().toString(), color: '#fff' })
  } else if (cmd === 'whoami') {
    lines.value.push({ text: 'brainplus\\admin', color: '#fff' })
  } else if (cmd === 'echo') {
    lines.value.push({ text: 'Echo 服务已启动', color: '#0f0' })
  } else if (cmd && cmd !== '') {
    lines.value.push({ text: `'${cmd}' 不是有效命令`, color: '#f66' })
  }
  
  currentCommand.value = ''
}
</script>

<style scoped>
.terminal {
  height: 100%;
  background: #1e1e1e;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.output {
  flex: 1;
}

.line {
  margin-bottom: 4px;
  word-break: break-all;
}

.spacer {
  height: 20px;
}

.input-line {
  display: flex;
  align-items: center;
  margin-top: 10px;
}

.prompt {
  color: #00ff00;
  margin-right: 8px;
  white-space: nowrap;
}

input {
  flex: 1;
  background: transparent;
  border: none;
  color: #00ff00;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  caret-color: #00ff00;
}

input::placeholder {
  color: transparent;
}
</style>
