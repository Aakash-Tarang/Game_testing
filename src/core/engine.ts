export interface GameEngine<State, Action, Render, Result> {
  init(seed: number, settings: any): State
  tick?(s: State, dtMs: number): State
  apply(s: State, a: Action): State
  fairValues?(s: State): Record<string, number>
  isOver(s: State): boolean
  result(s: State): Result
  render(s: State): Render
}

export type EngineRegistryEntry = {
  id: string
  name: string
  description: string
  icon: string
  settings: any // default settings schema
  engine: GameEngine<any, any, any, any>
  GameView: React.ComponentType<any>
  ResultsView: React.ComponentType<any>
}
