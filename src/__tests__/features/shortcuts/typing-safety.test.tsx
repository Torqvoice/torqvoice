import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TagInput } from '@/components/tag-input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutsProvider, useShortcut } from '@/features/shortcuts/Components/ShortcutsProvider'

/**
 * The promise these tests hold the app to: with every bare-key shortcut
 * switched on (only the calendar has them now: the go-to set is Alt+G, then
 * Alt and a letter, and so can never be typed), nothing
 * a person types into the app, and nothing typed while a dialog or a menu is
 * open, ever runs a shortcut. Each test types into the real component, at a
 * person's pace, and checks that the text arrived and the page stayed put.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/features/shortcuts/Actions/saveKeyboardShortcuts', () => ({
  saveKeyboardShortcuts: vi.fn(async (input: unknown) => ({ success: true, data: input })),
}))

// What jsdom leaves out and Radix and cmdk reach for.
class ResizeObserverStub {
  observe() {
    return undefined
  }
  unobserve() {
    return undefined
  }
  disconnect() {
    return undefined
  }
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined
Element.prototype.scrollIntoView ??= () => undefined

const calendar = vi.fn()

/** Every calendar letter claimed, as on the calendar page. */
function CalendarKeys() {
  useShortcut('calendar.day', () => calendar('day'))
  useShortcut('calendar.week', () => calendar('week'))
  useShortcut('calendar.month', () => calendar('month'))
  useShortcut('calendar.year', () => calendar('year'))
  useShortcut('calendar.schedule', () => calendar('schedule'))
  useShortcut('calendar.fourDays', () => calendar('fourDays'))
  useShortcut('calendar.today', () => calendar('today'))
  useShortcut('calendar.next', () => calendar('next'))
  useShortcut('calendar.previous', () => calendar('previous'))
  return null
}

function App({ children }: { children?: React.ReactNode }) {
  return (
    <ShortcutsProvider
      initialPrefs={{ goToSequences: true }}
      commands={{ isAdminOrOwner: true }}
      plateLookupAvailable={false}
    >
      <CalendarKeys />
      {children}
    </ShortcutsProvider>
  )
}

/** A person's pace: comfortably slower than a scanner, faster than the sequence window. */
const HUMAN = 70
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

/** Every letter a bare-key shortcut uses, in words a person might type. */
const SENTENCE = 'gw gq gd gc dwmyax tjnkp'

function nothingFired() {
  expect(push).not.toHaveBeenCalled()
  expect(calendar).not.toHaveBeenCalled()
}

/** Presses bare keys on an element at a person's pace, without typing them. */
async function pressKeys(target: Element, keys: string) {
  const events: KeyboardEvent[] = []
  for (const key of keys) {
    const event = new KeyboardEvent('keydown', {
      key: key === ' ' ? ' ' : key,
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    act(() => {
      target.dispatchEvent(event)
    })
    events.push(event)
    await wait(HUMAN)
  }
  return events
}

/** The same, with Alt held: the go-to set and the create chords. */
async function pressAlt(target: Element, keys: string) {
  for (const key of keys) {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true })
      )
    })
    await wait(HUMAN)
  }
}

beforeEach(async () => {
  push.mockClear()
  calendar.mockClear()
  // Past the quiet gap the previous test's typing left behind.
  await wait(10)
})

describe('the tests can tell a shortcut from no shortcut', () => {
  it('switches the calendar on a bare letter with the focus on the page', async () => {
    render(<App />)
    await pressKeys(document.body, 'm')
    expect(calendar).toHaveBeenCalledWith('month')
  })

  it('still works with the focus resting on a button, which uses no letters', async () => {
    render(
      <App>
        <button type="button">Today</button>
      </App>
    )
    screen.getByText('Today').focus()
    await pressKeys(screen.getByText('Today'), 'w')
    expect(calendar).toHaveBeenCalledWith('week')
  })

  it('opens a page on Alt+G then Alt+W, and never on the bare letters', async () => {
    render(<App />)
    await pressKeys(document.body, 'gw gq gg')
    expect(push).not.toHaveBeenCalled()
    await pressAlt(document.body, 'gw')
    expect(push).toHaveBeenCalledWith('/work-orders')
  })
})

describe('typing into a field never runs a shortcut', () => {
  it.each([
    'text',
    'search',
    'email',
    'tel',
    'url',
    'password',
  ])('a %s input keeps every letter', async (type) => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Input type={type} aria-label="Field" />
      </App>
    )
    const field = screen.getByLabelText('Field')
    await user.click(field)
    await user.keyboard(SENTENCE)
    expect(field).toHaveValue(SENTENCE)
    nothingFired()
  })

  it.each([
    'number',
    'date',
    'time',
    'datetime-local',
    'month',
    'checkbox',
    'radio',
    'range',
  ])('a %s input is left alone', async (type) => {
    render(
      <App>
        <input type={type} aria-label="Field" />
      </App>
    )
    const field = screen.getByLabelText('Field')
    field.focus()
    const events = await pressKeys(field, 'gwgqdwt')
    expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    nothingFired()
  })

  it('a textarea, as in a message or a work order note, keeps every letter', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Textarea aria-label="Message" />
      </App>
    )
    const field = screen.getByLabelText('Message')
    await user.click(field)
    await user.keyboard(SENTENCE)
    expect(field).toHaveValue(SENTENCE)
    nothingFired()
  })

  it('the rich text editor keeps every key', async () => {
    render(
      <App>
        <RichTextEditor content="" onChange={vi.fn()} />
      </App>
    )
    const editor = await vi.waitFor(() => {
      const el = document.querySelector('[contenteditable="true"]')
      if (!el) throw new Error('editor not mounted')
      return el as HTMLElement
    })
    editor.focus()
    const events = await pressKeys(editor, 'gwgqdwmt')
    expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    nothingFired()
  })

  it('any contenteditable or ARIA text box keeps every key, however deep the cursor is', async () => {
    render(
      <App>
        <div contentEditable suppressContentEditableWarning aria-label="Canvas text">
          <p>
            <span data-testid="deep">text</span>
          </p>
        </div>
        <div role="textbox" tabIndex={0} aria-label="Custom box" />
        <div role="searchbox" tabIndex={0} aria-label="Custom search" />
        <div role="spinbutton" tabIndex={0} aria-label="Custom number" />
      </App>
    )
    for (const target of [
      screen.getByTestId('deep'),
      screen.getByLabelText('Custom box'),
      screen.getByLabelText('Custom search'),
      screen.getByLabelText('Custom number'),
    ]) {
      const events = await pressKeys(target, 'gwdw')
      expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    }
    nothingFired()
  })

  it('a field inside a shadow root keeps every key', async () => {
    render(
      <App>
        <div data-testid="host" />
      </App>
    )
    const host = screen.getByTestId('host')
    const shadow = host.attachShadow({ mode: 'open' })
    const field = document.createElement('input')
    shadow.appendChild(field)
    field.focus()
    const events = await pressKeys(field, 'gwdw')
    expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    nothingFired()
  })

  it('a native select keeps its letters for jumping to an option', async () => {
    render(
      <App>
        <select aria-label="Status">
          <option>Waiting</option>
          <option>Done</option>
        </select>
      </App>
    )
    const select = screen.getByLabelText('Status')
    select.focus()
    const events = await pressKeys(select, 'gwdw')
    expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    nothingFired()
  })

  it('the date field keeps what is typed', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <DateInput value="" onChange={vi.fn()} placeholder="Date" />
      </App>
    )
    const field = screen.getByPlaceholderText('Date')
    await user.click(field)
    await user.keyboard('gw 12 dw')
    nothingFired()
  })

  it('the tag box keeps every letter', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <TagInput
          value={[]}
          onChange={vi.fn()}
          placeholder="Tags"
          removeLabel={(tag) => `Remove ${tag}`}
        />
      </App>
    )
    const field = screen.getByPlaceholderText('Tags')
    await user.click(field)
    await user.keyboard('gwdw')
    expect(field).toHaveValue('gwdw')
    nothingFired()
  })

  it('the search palette input keeps every letter', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandItem>Work orders</CommandItem>
          </CommandList>
        </Command>
      </App>
    )
    const field = screen.getByPlaceholderText('Search')
    await user.click(field)
    await user.keyboard('gw gq dw')
    expect(field).toHaveValue('gw gq dw')
    nothingFired()
  })
})

describe('pickers and lists keep their letters', () => {
  it('a select, closed with the focus on it and open on its list', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Select>
          <SelectTrigger aria-label="Technician">
            <SelectValue placeholder="Pick" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gunnar">Gunnar</SelectItem>
            <SelectItem value="wenche">Wenche</SelectItem>
          </SelectContent>
        </Select>
      </App>
    )
    const trigger = screen.getByLabelText('Technician')
    trigger.focus()
    await pressKeys(trigger, 'gw')
    nothingFired()
    await user.click(trigger)
    await pressKeys(document.activeElement ?? document.body, 'gwdw')
    await pressKeys(document.body, 'gw')
    nothingFired()
  })

  it('the searchable select, on its button and in its search box', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <SearchableSelect
          value=""
          onValueChange={vi.fn()}
          aria-label="Customer"
          searchable
          options={[
            { value: 'g', label: 'Gunnar Wold' },
            { value: 'w', label: 'Wenche Dahl' },
          ]}
        />
      </App>
    )
    const trigger = screen.getByRole('combobox', { name: 'Customer' })
    trigger.focus()
    await pressKeys(trigger, 'gw')
    nothingFired()
    await user.click(trigger)
    await user.keyboard('gw')
    await pressKeys(document.body, 'gwdw')
    nothingFired()
  })

  it('tabs keep the arrow keys the calendar would otherwise take', async () => {
    render(
      <App>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Parts</TabsTrigger>
            <TabsTrigger value="b">Labor</TabsTrigger>
          </TabsList>
        </Tabs>
      </App>
    )
    const tab = screen.getByRole('tab', { name: 'Parts' })
    tab.focus()
    for (const key of ['ArrowRight', 'ArrowLeft']) fireEvent.keyDown(tab, { key })
    await pressKeys(tab, 'gw')
    nothingFired()
  })

  it('custom lists, trees, grids and menus keep their type-ahead', async () => {
    render(
      <App>
        <div role="listbox" tabIndex={0} aria-label="List">
          <div role="option" tabIndex={-1} aria-selected="false">
            Gearbox
          </div>
        </div>
        <div role="tree" tabIndex={0} aria-label="Tree">
          <div role="treeitem" tabIndex={-1} aria-selected="false">
            Wheels
          </div>
        </div>
        <div role="grid" tabIndex={0} aria-label="Grid" />
        <div role="menu" data-state="closed" tabIndex={0} aria-label="Menu" />
        <div data-shortcuts="off" tabIndex={0} data-testid="opted-out" />
      </App>
    )
    for (const target of [
      screen.getByText('Gearbox'),
      screen.getByText('Wheels'),
      screen.getByLabelText('Grid'),
      screen.getByLabelText('Menu'),
      screen.getByTestId('opted-out'),
    ]) {
      const events = await pressKeys(target, 'gwdw')
      expect(events.every((event) => !event.defaultPrevented)).toBe(true)
    }
    nothingFired()
  })
})

describe('nothing fires while something is open on top of the page', () => {
  const overlays: [string, React.ReactNode][] = [
    [
      'a dialog',
      <Dialog key="d" open>
        <DialogContent>
          <DialogTitle>Edit</DialogTitle>
          <DialogDescription>Details</DialogDescription>
          <Input aria-label="Inside" />
        </DialogContent>
      </Dialog>,
    ],
    [
      'an alert dialog',
      <AlertDialog key="a" open>
        <AlertDialogContent>
          <AlertDialogTitle>Sure?</AlertDialogTitle>
          <AlertDialogDescription>Details</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    ],
    [
      'a sheet',
      <Sheet key="s" open>
        <SheetContent>
          <SheetTitle>Panel</SheetTitle>
          <SheetDescription>Details</SheetDescription>
        </SheetContent>
      </Sheet>,
    ],
    [
      'a drawer',
      <Drawer key="w" open>
        <DrawerContent>
          <DrawerTitle>More</DrawerTitle>
          <DrawerDescription>Details</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    ],
    [
      'a popover',
      <Popover key="p" open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>Content</PopoverContent>
      </Popover>,
    ],
    [
      'a dropdown menu',
      <DropdownMenu key="m" open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Week</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    ],
    [
      'a lightbox of the app’s own',
      <div key="l" data-shortcut-layer>
        <img alt="" />
      </div>,
    ],
    [
      'a modal with no state attribute',
      <div key="x" role="dialog" aria-modal="true" aria-label="Viewer" />,
    ],
  ]

  it.each(overlays)('%s', async (_name, overlay) => {
    render(<App>{overlay}</App>)
    await wait(50)
    // On the page behind it, on whatever it focused, and in a field inside it.
    await pressKeys(document.body, 'gwdw')
    await pressKeys(document.activeElement ?? document.body, 'gqmt')
    nothingFired()
  })

  it('a context menu', async () => {
    render(
      <App>
        <ContextMenu>
          <ContextMenuTrigger>Row</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Week</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </App>
    )
    fireEvent.contextMenu(screen.getByText('Row'))
    await screen.findByRole('menu')
    await pressKeys(document.body, 'gwdw')
    await pressKeys(document.activeElement ?? document.body, 'gwdw')
    nothingFired()
  })

  it('a field in a dialog keeps every letter', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Edit</DialogTitle>
            <DialogDescription>Details</DialogDescription>
            <Input aria-label="Inside" />
          </DialogContent>
        </Dialog>
      </App>
    )
    const field = screen.getByLabelText('Inside')
    await user.click(field)
    await user.keyboard(SENTENCE)
    expect(field).toHaveValue(SENTENCE)
    nothingFired()
  })

  it('a tooltip under the mouse does not count: it takes no keys', async () => {
    render(
      <App>
        <TooltipProvider>
          <Tooltip open>
            <TooltipTrigger>Hover</TooltipTrigger>
            <TooltipContent>Hint</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </App>
    )
    await wait(50)
    await pressKeys(document.body, 'w')
    expect(calendar).toHaveBeenCalledWith('week')
  })

  it('the go-to and create chords wait for a dialog to close as well', async () => {
    render(
      <App>
        <div role="dialog" data-state="open" aria-label="Confirm" />
      </App>
    )
    await pressAlt(document.body, 'gw')
    await pressAlt(document.body, 'q')
    nothingFired()
  })
})

describe('the awkward moments', () => {
  it('Alt+G on the page, then a bare letter typed into a field', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Input aria-label="Note" />
      </App>
    )
    await pressAlt(document.body, 'g')
    const field = screen.getByLabelText('Note')
    await user.click(field)
    await user.keyboard('w')
    expect(field).toHaveValue('w')
    nothingFired()
  })

  it('Alt+G on the page, then a dialog opens before the letter', async () => {
    const { rerender } = render(<App />)
    await pressAlt(document.body, 'g')
    rerender(
      <App>
        <div role="dialog" data-state="open" aria-label="Confirm" />
      </App>
    )
    await pressAlt(document.body, 'w')
    nothingFired()
  })

  it('a sentence that outlives its dialog: keys just after it closes are not commands', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    const { rerender } = render(
      <App>
        <div role="dialog" data-state="open" aria-label="Quick add">
          <input aria-label="Name" />
        </div>
      </App>
    )
    const field = screen.getByLabelText('Name')
    await user.click(field)
    await user.keyboard('bolt')
    // Enter saved and closed it; the next keys land on the page.
    rerender(<App />)
    await pressKeys(document.body, 'gwdw')
    nothingFired()
    // Once the person has stopped, the page answers again.
    await wait(600)
    await pressKeys(document.body, 'w')
    expect(calendar).toHaveBeenCalledWith('week')
  })

  it('keys right after leaving a field are not commands either', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Input aria-label="Note" />
      </App>
    )
    const field = screen.getByLabelText('Note')
    await user.click(field)
    await user.keyboard('torque')
    act(() => field.blur())
    await pressKeys(document.body, 'gw')
    nothingFired()
  })

  it('Alt+G held until it repeats is still one Alt+G', async () => {
    render(<App />)
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'g', altKey: true, bubbles: true })
      )
      for (let i = 0; i < 5; i++) {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'g', altKey: true, repeat: true, bubbles: true })
        )
      }
    })
    await pressAlt(document.body, 'w')
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/work-orders')
  })

  it('Alt+G then a bare key leaves that key its own meaning', async () => {
    render(<App />)
    await pressAlt(document.body, 'g')
    await pressKeys(document.body, 'x')
    expect(push).not.toHaveBeenCalled()
    expect(calendar).toHaveBeenCalledWith('fourDays')
  })

  it('Alt+G then Alt and a letter that opens no page does nothing, and takes nothing', async () => {
    render(<App />)
    await pressAlt(document.body, 'g')
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    act(() => {
      document.body.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(false)
    nothingFired()
  })

  it('letting go of Alt between the two presses keeps the sequence', async () => {
    render(<App />)
    await pressAlt(document.body, 'g')
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true })
      )
    })
    await wait(HUMAN)
    await pressAlt(document.body, 'w')
    expect(push).toHaveBeenCalledWith('/work-orders')
  })

  it('a click between the two presses is a change of mind', async () => {
    render(
      <App>
        <p>Somewhere</p>
      </App>
    )
    await pressAlt(document.body, 'g')
    fireEvent.pointerDown(screen.getByText('Somewhere'))
    await pressAlt(document.body, 'w')
    // Alt+W on its own: a new work order, not the list.
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
  })

  it('the go-to set works from inside a field without typing anything', async () => {
    const user = userEvent.setup({ delay: HUMAN })
    render(
      <App>
        <Input aria-label="Note" />
      </App>
    )
    const field = screen.getByLabelText('Note')
    await user.click(field)
    await user.keyboard('bolt')
    await pressAlt(field, 'gq')
    expect(field).toHaveValue('bolt')
    expect(push).toHaveBeenCalledWith('/quotes')
  })

  it('keys of an input method being composed are left alone', async () => {
    render(<App />)
    for (const key of ['g', 'w', 'd']) {
      const event = new KeyboardEvent('keydown', {
        key,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      act(() => {
        document.body.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
      await wait(HUMAN)
    }
    nothingFired()
  })

  it('the focus is already in the field when a click is followed by fast typing', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <App>
        <Textarea aria-label="Message" />
      </App>
    )
    const field = screen.getByLabelText('Message')
    await user.pointer({ keys: '[MouseLeft>]', target: field })
    await user.keyboard('gw')
    await user.pointer({ keys: '[/MouseLeft]', target: field })
    expect(field).toHaveValue('gw')
    await wait(HUMAN)
    nothingFired()
  })
})

describe('a barcode scanner is not a person', () => {
  /** A scanner: every character within a few milliseconds, then Enter. */
  function scan(code: string, target: Element = document.body) {
    act(() => {
      for (const key of [...code, 'Enter']) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      }
    })
  }

  it.each([
    'gw',
    'GW4471',
    'w',
    'd',
    'wd40',
    'tjnkp',
    '7gq12',
  ])('scanning "%s" with no field focused runs nothing', async (code) => {
    render(<App />)
    scan(code.toLowerCase())
    await wait(200)
    nothingFired()
  })

  it('a scan a few milliseconds a key apart runs nothing', async () => {
    render(<App />)
    for (const key of ['g', 'w', '4', '2', 'Enter']) {
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
      await wait(8)
    }
    await wait(200)
    nothingFired()
  })

  it('the page answers a person again after a scan', async () => {
    render(<App />)
    scan('gw4471')
    await wait(200)
    await pressKeys(document.body, 'w')
    expect(calendar).toHaveBeenCalledWith('week')
  })
})
