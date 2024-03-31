<template>
  <hello-world :msg="msg" />
</template>

<script>
import HelloWorld from '@/components/HelloWorld.vue'
export default {
  name: "PageIndex",
  components: {
    HelloWorld
  },
  data() {
    return {
      msg: 'Welcome to Your Vue.js App'
    }
  }
}
</script>

<style scoped>

</style>
