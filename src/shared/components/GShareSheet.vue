<script setup lang="ts">
/**
 * 分享抽屉：目前只给两条路 —— 复制链接、生成分享图（带二维码）。
 *
 * 为什么不做「系统分享面板」：iOS 的系统面板里能通往的地方大多是半成品
 * （微信要 JS-SDK 卡片、朋友圈没有接口），真正可用的其实是「把链接发给对方」
 * 和「发一张带二维码的图」。先把这两条做扎实，其余渠道之后再补。
 */
import { ref, watch } from 'vue'
import GIcon from './GIcon.vue'
import { resolvedTheme } from '../theme'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 文章标题，抽屉里显示一行，确认自己分享的是哪篇 */
    title?: string
    /** 要复制的地址 */
    url: string
    /** 这个地址是不是「任何人可打开」的公开链接 */
    isPublic?: boolean
  }>(),
  { title: '', isPublic: true },
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'poster'): void }>()

const copied = ref(false)

watch(
  () => props.open,
  (v) => {
    if (v) copied.value = false
  },
)

function copyLink(): void {
  if (!props.url) return
  uni.setClipboardData({
    data: props.url,
    success: () => {
      copied.value = true
      // setClipboardData 自带一个系统 toast，这里不再叠一层
      setTimeout(() => {
        copied.value = false
        emit('close')
      }, 500)
    },
    fail: () => {
      uni.showToast({ title: '复制失败', icon: 'none' })
    },
  })
}

function makePoster(): void {
  emit('close')
  emit('poster')
}
</script>

<template>
  <view v-if="open" class="smask" @click="emit('close')" />
  <view :class="['ssheet', `theme-${resolvedTheme}`, { 'is-open': open }]">
    <view class="sgrip" />
    <view class="shead">
      <text class="stitle">分享</text>
      <text v-if="title" class="ssub">{{ title }}</text>
    </view>

    <!-- 未公开时说清代价，而不是给一个别人打不开的地址还装作正常 -->
    <view v-if="!isPublic" class="swarn">
      <GIcon name="eye" :size="26" :weight="2" />
      <text class="swarn-t">这篇还没公开，扫码或打开的人需要登录</text>
    </view>

    <view class="slist">
      <view class="srow" @click="copyLink">
        <view class="sico"><GIcon name="link" :size="34" :weight="2" /></view>
        <view class="smain">
          <text class="srow-t">复制链接</text>
          <text class="srow-h">{{ copied ? '已复制' : '粘贴到任意聊天窗口' }}</text>
        </view>
        <GIcon v-if="copied" name="check" :size="30" :weight="2.4" class="sok" />
      </view>

      <view class="sdivider" />

      <view class="srow" @click="makePoster">
        <view class="sico"><GIcon name="image" :size="34" :weight="2" /></view>
        <view class="smain">
          <text class="srow-t">生成图片</text>
          <text class="srow-h">带标题与二维码，可直接发出去</text>
        </view>
      </view>
    </view>

    <view class="scancel" @click="emit('close')">取消</view>
    <view class="stail" />
  </view>
</template>

<style scoped>
.smask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background-color: rgba(0, 0, 0, 0.4);
}

.ssheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 101;
  box-sizing: border-box;
  background-color: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: 14rpx 0 0;
  transform: translateY(110%);
  transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1);
}

.ssheet.is-open {
  transform: translateY(0);
}

.sgrip {
  width: 72rpx;
  height: 8rpx;
  border-radius: 9999rpx;
  background-color: var(--line-strong);
  margin: 0 auto 18rpx;
}

.shead {
  display: flex;
  flex-direction: column;
  padding: 0 36rpx 16rpx;
}

.stitle {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.4rpx;
}

.ssub {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swarn {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin: 0 36rpx 16rpx;
  padding: 14rpx 20rpx;
  border-radius: var(--r-sm);
  background-color: var(--surface-2);
  color: var(--muted);
}

.swarn-t {
  font-size: 24rpx;
  line-height: 1.4;
}

.slist {
  margin: 0 24rpx;
  border-radius: var(--r-md);
  background-color: var(--surface-2);
  overflow: hidden;
}

.srow {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
}

.srow:active {
  background-color: var(--bg-hover);
}

.sico {
  flex: 0 0 auto;
  width: 72rpx;
  height: 72rpx;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface);
  color: var(--accent);
}

.smain {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.srow-t {
  font-size: 30rpx;
  color: var(--text);
}

.srow-h {
  font-size: 22rpx;
  color: var(--faint);
}

.sok {
  flex: 0 0 auto;
  color: var(--ok);
}

.sdivider {
  height: 1rpx;
  margin-left: 116rpx;
  background-color: var(--line);
}

.scancel {
  margin: 16rpx 24rpx 0;
  height: 96rpx;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  color: var(--text-2);
  background-color: var(--surface-2);
}

.scancel:active {
  background-color: var(--bg-hover);
}

.stail {
  height: calc(env(safe-area-inset-bottom, 0px) + 20rpx);
}
</style>
