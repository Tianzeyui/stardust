/**
 * 插件模板 — React/TSX 版
 *
 * 可 import 的宿主模块：
 *   react, lucide-react, @/lib/utils,
 *   @/components/ui/{button, input, badge, card, label, switch}
 */
import React, { useState } from 'react'
import { Box } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function register(ctx: any) {
  const MyPage = () => {
    const [count, setCount] = useState(0)

    return (
      <div className="p-4 space-y-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <Box className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">我的插件</h2>
                <p className="text-[10px] text-muted-foreground">React/TSX 模式 · v1.0.0</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              使用 React + shadcn/ui 构建插件页面。点击下方按钮测试交互：
            </p>
            <Button size="sm" className="mt-3 h-8 text-xs" onClick={() => setCount(count + 1)}>
              点击计数：{count}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  ctx.registerNav({ id: 'my-plugin', label: '我的插件', icon: 'Package', order: 90 })
  ctx.registerRoute('my-plugin', () => Promise.resolve({ default: MyPage }))
}
