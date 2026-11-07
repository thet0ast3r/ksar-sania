<script>
  import { T } from '@threlte/core'
  import { Outlines } from '@threlte/extras'
  import { toon } from './toon.js'

  let {
    geometry,
    color = '#ffffff',
    outline = 0.08,
    vertexColors = false,
    castShadow = true,
    receiveShadow = true,
    ...rest
  } = $props()

  const material = $derived(toon(color, vertexColors))
</script>

<T.Mesh {geometry} {material} {castShadow} {receiveShadow} {...rest}>
  {#if outline > 0}
    <Outlines thickness={outline} color="#2b140a" />
  {/if}
</T.Mesh>
