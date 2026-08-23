import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GuidedTour } from './guided-tour'

describe('GuidedTour', () => {
  it('requires an explicit next confirmation and supports previous', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button data-tour="search">Search</button>
        <GuidedTour open steps={[{ target: 'search', title: '搜索框', body: '输入应用' }, { target: 'search', title: '结果', body: '选择结果' }]} />
      </div>,
    )

    expect(screen.getByText('第 1 步 / 共 2 步')).toBeInTheDocument()
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-full-mask')).not.toBeInTheDocument()
    expect(screen.queryByText('结果')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('第 2 步 / 共 2 步')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('第 1 步 / 共 2 步')).toBeInTheDocument()
  })

  it('supports skip and Escape to close', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button data-tour="search">Search</button>
        <GuidedTour open steps={[{ target: 'search', title: '搜索框', body: '输入应用' }]} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: '跳过教程' }))
    expect(screen.queryByText('第 1 步 / 共 1 步')).not.toBeInTheDocument()
  })

  it('supports Enter to continue and Escape to close', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button data-tour="search">Search</button>
        <GuidedTour open steps={[{ target: 'search', title: '搜索框', body: '输入应用' }, { target: 'search', title: '结果', body: '选择结果' }]} />
      </div>,
    )

    await user.keyboard('{Enter}')
    expect(screen.getByText('第 2 步 / 共 2 步')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '使用教程' })).not.toBeInTheDocument()
  })
})
