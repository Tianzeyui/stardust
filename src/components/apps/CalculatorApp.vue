<template>
  <div class="calculator">
    <div class="display">
      <div class="expression">{{ expression || '&nbsp;' }}</div>
      <div class="result">{{ display }}</div>
    </div>
    <div class="buttons">
      <button 
        v-for="btn in buttons" 
        :key="btn"
        :class="getButtonClass(btn)"
        @click="handleClick(btn)"
      >
        {{ btn }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const display = ref('0')
const expression = ref('')
const currentNumber = ref('0')
const previousNumber = ref(null)
const operation = ref(null)
const resetNext = ref(false)

const buttons = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=']

const getButtonClass = (btn) => {
  if (btn === '=') return 'btn-equal'
  if (['+', '-', '×', '÷'].includes(btn)) return 'btn-operator'
  if (['C', '±', '%'].includes(btn)) return 'btn-function'
  return 'btn-number'
}

const handleClick = (btn) => {
  if (btn === 'C') {
    display.value = '0'
    expression.value = ''
    currentNumber.value = '0'
    previousNumber.value = null
    operation.value = null
    resetNext.value = false
  } else if (btn === '=') {
    if (operation.value && previousNumber.value !== null) {
      const prev = parseFloat(previousNumber.value)
      const curr = parseFloat(currentNumber.value)
      let result = 0
      
      if (operation.value === '+') result = prev + curr
      else if (operation.value === '-') result = prev - curr
      else if (operation.value === '×') result = prev * curr
      else if (operation.value === '÷') result = curr !== 0 ? prev / curr : 'Error'
      
      expression.value = `${previousNumber.value} ${operation.value} ${currentNumber.value} =`
      display.value = String(result)
      currentNumber.value = String(result)
      previousNumber.value = null
      operation.value = null
      resetNext.value = true
    }
  } else if (['+', '-', '×', '÷'].includes(btn)) {
    if (operation.value && !resetNext.value) handleClick('=')
    previousNumber.value = currentNumber.value
    operation.value = btn
    expression.value = `${currentNumber.value} ${btn}`
    resetNext.value = true
  } else if (btn === '±') {
    currentNumber.value = String(parseFloat(currentNumber.value) * -1)
    display.value = currentNumber.value
  } else if (btn === '%') {
    currentNumber.value = String(parseFloat(currentNumber.value) / 100)
    display.value = currentNumber.value
  } else if (btn === '.') {
    if (!currentNumber.value.includes('.')) {
      currentNumber.value += '.'
      display.value = currentNumber.value
    }
  } else {
    if (resetNext.value) {
      currentNumber.value = btn
      resetNext.value = false
    } else {
      currentNumber.value = currentNumber.value === '0' ? btn : currentNumber.value + btn
    }
    display.value = currentNumber.value
  }
}
</script>

<style scoped>
.calculator {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #2d2d2d;
  padding: 20px;
}

.display {
  background: #1a1a1a;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: right;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.expression {
  color: #999;
  font-size: 14px;
  margin-bottom: 8px;
  min-height: 20px;
}

.result {
  color: white;
  font-size: 36px;
  font-weight: 300;
}

.buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  flex: 1;
}

button {
  border: none;
  border-radius: 8px;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

button:active {
  transform: scale(0.95);
}

.btn-number {
  background: #505050;
  color: white;
}

.btn-number:hover {
  background: #606060;
}

.btn-operator {
  background: #ff9500;
  color: white;
}

.btn-operator:hover {
  background: #ffaa20;
}

.btn-equal {
  background: #4CAF50;
  color: white;
}

.btn-equal:hover {
  background: #5cb860;
}

.btn-function {
  background: #505050;
  color: white;
}

.btn-function:hover {
  background: #606060;
}
</style>
