import{t as e}from"./shaderStore-D-XQlhUT.js";import{ht as t,mt as n}from"./index-CtP0B350.js";var r=`volumetricLightingRenderVolumeVertexShader`,i=`#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position : vec3f;varying vWorldPos: vec4f;@vertex
fn main(input : VertexInputs)->FragmentInputs {let worldPos=mesh.world*vec4f(vertexInputs.position,1.0);vertexOutputs.vWorldPos=worldPos;vertexOutputs.position=scene.viewProjection*worldPos;}
`;e.ShadersStoreWGSL[r]||(e.ShadersStoreWGSL[r]=i);var a=[n,t];for(let t of a)e.IncludesShadersStoreWGSL[t.name]||(e.IncludesShadersStoreWGSL[t.name]=t.shader);var o={name:r,shader:i};export{o as volumetricLightingRenderVolumeVertexShaderWGSL};