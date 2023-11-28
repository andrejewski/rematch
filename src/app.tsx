import * as React from 'react'
import { Change, Dispatch } from 'raj-ts'
import {
  Subscription,
  mapSubscription,
  withSubscriptions,
} from 'raj-ts/lib/subscription'

type Model = {
  scene: 'home' | 'about' | 'game' | 'game-over'
  score: number
  windowSize: Size
  wheelCanvas: React.RefObject<HTMLCanvasElement>
  wheelColor: string
  wheelRotation: number
  levelStart: number

  previousWallColor: Rgb
  wallProgress: number
  nextWallColor: Rgb
}

type Msg =
  | { type: 'start_game' }
  | { type: 'wheel_click'; x: number; y: number }
  | { type: 'open_about' }
  | { type: 'return_home' }
  | { type: 'draw_tick'; delta: number }
  | { type: 'window_size'; size: Size }

const defaultColor: Rgb = [255, 255, 255]

const init: Change<Msg, Model> = [
  {
    scene: 'home',
    score: 0,
    windowSize: { width: 0, height: 0 },
    wheelCanvas: React.createRef(),
    wheelColor: '#000000',
    wheelRotation: 0,
    levelStart: 0,

    previousWallColor: defaultColor,
    nextWallColor: defaultColor,
    wallProgress: 0,
  },
]

function setUpCanvas(model: Model) {
  const { wheelCanvas } = model
  const canvas = wheelCanvas.current
  if (!canvas) {
    return
  }

  const { width, height } = model.windowSize
  const minSize = Math.min(width, height)
  const xSize = Math.floor(
    width < height
      ? Math.min(minSize * 0.75, height)
      : Math.min(minSize * 0.75, width)
  )

  if (canvas.width === xSize * 2) {
    return
  }

  drawColorWheel(canvas, xSize)
}

type Rgb = readonly [number, number, number]

const similarColorDelta = 20

function getColorOnWheelPoint(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): Rgb | undefined {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return
  }

  const pixelData = ctx.getImageData(x, y, 1, 1).data
  const r = pixelData[0]
  const g = pixelData[1]
  const b = pixelData[2]
  const rgb = [r, g, b] as const

  if (rgb.every((c) => c === 0)) {
    return
  }

  return rgb
}

function getRandomColorSample(
  canvas: HTMLCanvasElement,
  contrastColor: Rgb
): Rgb {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return defaultColor
  }

  let attempt = 0
  while (attempt++ < 10) {
    const x = Math.floor(Math.random() * canvas.width)
    const y = Math.floor(Math.random() * canvas.height)

    const pixelData = ctx.getImageData(x, y, 1, 1).data
    const r = pixelData[0]
    const g = pixelData[1]
    const b = pixelData[2]
    const rgb = [r, g, b] as const

    if (rgb.every((c) => c > 232) || rgb.every((c) => c === 0)) {
      continue
    }

    if (deltaE(contrastColor, rgb) < similarColorDelta) {
      continue
    }

    return rgb
  }

  return defaultColor
}

function makeHexColor(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function rotate(cx: number, cy: number, x: number, y: number, angle: number) {
  const radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = cos * (x - cx) + sin * (y - cy) + cx,
    ny = cos * (y - cy) - sin * (x - cx) + cy
  return [nx, ny]
}

function update(msg: Msg, model: Model): Change<Msg, Model> {
  switch (msg.type) {
    case 'start_game': {
      return [
        {
          ...model,
          scene: 'game',
          score: 0,
          levelStart: Date.now(),
          wallProgress: 0,
          nextWallColor: model.wheelCanvas.current
            ? getRandomColorSample(
                model.wheelCanvas.current,
                model.previousWallColor
              )
            : defaultColor,
        },
      ]
    }
    case 'open_about': {
      return [{ ...model, scene: 'about' }]
    }
    case 'return_home': {
      return [
        {
          ...init[0],
          windowSize: model.windowSize,
          wheelCanvas: model.wheelCanvas,
        },
      ]
    }
    case 'window_size': {
      const newModel = { ...model, windowSize: msg.size }

      setUpCanvas(newModel)
      return [newModel]
    }
    case 'draw_tick': {
      setUpCanvas(model)
      switch (model.scene) {
        case 'home': {
          const nextRotation =
            model.wheelRotation >= 359 ? 0 : model.wheelRotation + 0.25

          return [{ ...model, wheelRotation: nextRotation }]
        }

        case 'game': {
          if (model.wallProgress === 1) {
            return [
              {
                ...model,
                scene: 'game-over',
                previousWallColor: model.nextWallColor,
              },
            ]
          }

          const levelDuration =
            5000 - (model.score > 50 ? model.score : model.score * 50)
          const wallProgress = Math.max(
            Math.min((Date.now() - model.levelStart) / levelDuration, 1),
            0
          )

          return [{ ...model, wallProgress }]
        }

        default:
          return [model]
      }
    }
    case 'wheel_click': {
      const { wheelCanvas } = model
      const canvas = wheelCanvas.current
      if (!canvas) {
        return [model]
      }

      const pixelCenter = canvas.width / 4
      const [rx, ry] = rotate(
        pixelCenter,
        pixelCenter,
        msg.x,
        msg.y,
        model.wheelRotation
      )

      const clickedColor = getColorOnWheelPoint(canvas, rx * 2, ry * 2)
      if (!clickedColor) {
        return [model]
      }

      if (deltaE(clickedColor, model.nextWallColor) > similarColorDelta) {
        return [model]
      }

      const nextRotation = Math.max(0, Math.min(360, Math.random() * 360))

      return [
        {
          ...model,
          score: model.score + 1,
          previousWallColor: model.nextWallColor,
          nextWallColor: getRandomColorSample(canvas, model.nextWallColor),
          wallProgress: 0,
          levelStart: Date.now(),
          wheelRotation: nextRotation,
        },
      ]
    }
    default:
      return [model]
  }
}

function view(model: Model, dispatch: Dispatch<Msg>) {
  let title
  let footerText
  switch (model.scene) {
    case 'about':
      title = 'About Re:Match'
      footerText = (
        <button onClick={() => dispatch({ type: 'return_home' })}>
          Back to game
        </button>
      )
      break
    case 'game':
      title = `Match ${model.score + 1}`
      footerText = `${((1 - model.wallProgress) * 100).toFixed(0)}%`
      break
    case 'game-over':
      title = (
        <span onClick={() => dispatch({ type: 'return_home' })}>Game Over</span>
      )
      footerText = `Final score: ${model.score}`
      break
    case 'home':
      title = 'Re:Match'
      footerText = (
        <button onClick={() => dispatch({ type: 'open_about' })}>
          What's this?
        </button>
      )
      break
  }

  return (
    <div className="app">
      <div className="header">
        <h1>{title}</h1>
      </div>
      <div className="footer">
        <h1>{footerText}</h1>
      </div>

      <div
        onClick={
          model.scene === 'game'
            ? (e) => {
                const div = e.currentTarget
                if (!div) {
                  return
                }

                const bounds = div.getBoundingClientRect()
                dispatch({
                  type: 'wheel_click',
                  x: e.clientX - bounds.left,
                  y: e.clientY - bounds.top,
                })
              }
            : undefined
        }
      >
        <canvas
          id="canvas"
          style={{
            opacity: model.scene === 'about' ? 0.1 : undefined,
            rotate: `${model.wheelRotation}deg`,
            transition:
              model.scene === 'game'
                ? 'rotate 0.25s cubic-bezier(0.280, 0.840, 0.420, 1)'
                : undefined,
          }}
          ref={model.wheelCanvas}
        />
      </div>

      {model.scene === 'about' && (
        <div className="about">
          <p>
            Become one with the color wheel as you race to match the incoming
            colors.
          </p>

          <p>
            Made by <a href="https://jew.ski">Chris Andrejewski</a>
          </p>
        </div>
      )}

      {(model.scene === 'home' || model.scene === 'game-over') && (
        <button
          className="play-button"
          onClick={() => dispatch({ type: 'start_game' })}
        >
          <div className="play-button--icon" />
        </button>
      )}

      <div
        className="old-color-wall"
        style={{ backgroundColor: makeHexColor(model.previousWallColor) }}
      ></div>
      <div
        className="new-color-wall"
        style={{
          backgroundColor: makeHexColor(model.nextWallColor),
          width: `${model.wallProgress * 100}%`,
        }}
      >
        {model.scene === 'game' && model.score === 0 && (
          <>
            <div className="header header--static">
              <h1>&nbsp;&nbsp;</h1>
            </div>
            <p className="tutorial-indicator">Match this color ➡</p>
          </>
        )}
      </div>
    </div>
  )
}

function rafSub(): Subscription<number> {
  let request: number
  let lastTickedAt = Date.now()

  return {
    effect: (dispatch: Dispatch<number>) => {
      request = requestAnimationFrame(function loop() {
        const tick = Date.now()
        dispatch(tick - lastTickedAt)
        lastTickedAt = tick
        request = requestAnimationFrame(loop)
      })
    },
    cancel() {
      cancelAnimationFrame(request)
    },
  }
}

type Size = { width: number; height: number }

function sizeSub(): Subscription<Size> {
  let listener: () => void

  return {
    effect(dispatch: Dispatch<Size>) {
      listener = () => {
        dispatch({
          width: window.innerWidth,
          height: window.innerHeight,
        })
      }

      window.addEventListener('resize', listener)
      listener()
    },
    cancel() {
      if (listener) {
        window.removeEventListener('resize', listener)
      }
    },
  }
}

function subscriptions(model: Model) {
  return {
    tick: () =>
      mapSubscription(
        rafSub(),
        (delta) => ({ type: 'draw_tick', delta } as const)
      ),
    size: () =>
      mapSubscription(
        sizeSub(),
        (size) => ({ type: 'window_size', size } as const)
      ),
  }
}

export const appProgram = withSubscriptions({
  init,
  update,
  view,
  subscriptions,
})

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180)
}

// Copied from https://stackoverflow.com/a/54951764
function drawColorWheel(canvas: HTMLCanvasElement, size: number) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return
  }

  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  size = size * 2

  canvas.width = size
  canvas.height = size

  const centerColor = 'white'

  // Initiate variables
  let angle = 0
  const hexCode = [0, 0, 255]
  let pivotPointer = 0
  const colorOffsetByDegree = 4.322
  const radius = size / 2

  // For each degree in circle, perform operation
  while (angle < 360) {
    // find index immediately before and after our pivot
    const pivotPointerBefore = (pivotPointer + 3 - 1) % 3

    // Modify colors
    if (hexCode[pivotPointer] < 255) {
      // If main points isn't full, add to main pointer
      hexCode[pivotPointer] =
        hexCode[pivotPointer] + colorOffsetByDegree > 255
          ? 255
          : hexCode[pivotPointer] + colorOffsetByDegree
    } else if (hexCode[pivotPointerBefore] > 0) {
      // If color before main isn't zero, subtract
      hexCode[pivotPointerBefore] =
        hexCode[pivotPointerBefore] > colorOffsetByDegree
          ? hexCode[pivotPointerBefore] - colorOffsetByDegree
          : 0
    } else if (hexCode[pivotPointer] >= 255) {
      // If main color is full, move pivot
      hexCode[pivotPointer] = 255
      pivotPointer = (pivotPointer + 1) % 3
    }

    const rgb = `rgb(${hexCode.map((h) => Math.floor(h)).join(',')})`
    const grad = context.createRadialGradient(
      radius,
      radius,
      0,
      radius,
      radius,
      radius
    )
    grad.addColorStop(0, centerColor)
    grad.addColorStop(1, rgb)
    context.fillStyle = grad

    // draw circle portion
    context.globalCompositeOperation = 'source-over'
    context.beginPath()
    context.moveTo(radius, radius)
    context.arc(
      radius,
      radius,
      radius,
      degreesToRadians(angle),
      degreesToRadians(360)
    )
    context.closePath()
    context.fill()
    angle++
  }
}

// Copied from https://stackoverflow.com/a/52453462
function deltaE(rgbA: Rgb, rgbB: Rgb) {
  let labA = rgb2lab(rgbA)
  let labB = rgb2lab(rgbB)
  let deltaL = labA[0] - labB[0]
  let deltaA = labA[1] - labB[1]
  let deltaB = labA[2] - labB[2]
  let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2])
  let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2])
  let deltaC = c1 - c2
  let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC
  deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH)
  let sc = 1.0 + 0.045 * c1
  let sh = 1.0 + 0.015 * c1
  let deltaLKlsl = deltaL / 1.0
  let deltaCkcsc = deltaC / sc
  let deltaHkhsh = deltaH / sh
  let i =
    deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh
  return i < 0 ? 0 : Math.sqrt(i)
}

function rgb2lab(rgb: Rgb) {
  let r = rgb[0] / 255,
    g = rgb[1] / 255,
    b = rgb[2] / 255,
    x,
    y,
    z
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
  x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0
  z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
