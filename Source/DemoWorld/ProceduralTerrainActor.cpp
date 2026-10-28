// DemoWorld/Source/DemoWorld/ProceduralTerrainActor.cpp
#include "ProceduralTerrainActor.h"
#include "Engine/Engine.h"
#include "Kismet/KismetMathLibrary.h"

AProceduralTerrainActor::AProceduralTerrainActor()
{
    PrimaryActorTick.bCanEverTick = false;
    ProcMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("ProceduralMesh"));
    RootComponent = ProcMesh;
    ProcMesh->bUseAsyncCooking = true;
}

void AProceduralTerrainActor::OnConstruction(const FTransform& Transform)
{
    Super::OnConstruction(Transform);
    GenerateTerrain();
}

void AProceduralTerrainActor::GenerateTerrain()
{
    TArray<FVector> Vertices;
    TArray<int32> Triangles;
    TArray<FVector> Normals;
    TArray<FVector2D> UV0;
    TArray<FProcMeshTangent> Tangents;
    TArray<FLinearColor> VertexColors;

    // Create grid vertices
    for (int32 y = 0; y <= VertexCount; ++y)
    {
        for (int32 x = 0; x <= VertexCount; ++x)
        {
            float WorldX = x * Scale;
            float WorldY = y * Scale;
            float Height = GetHeight(WorldX, WorldY) * HeightScale;
            Vertices.Add(FVector(WorldX, WorldY, Height));
            UV0.Add(FVector2D((float)x / VertexCount, (float)y / VertexCount));
            Normals.Add(FVector::UpVector);
            Tangents.Add(FProcMeshTangent(1, 0, 0));
            VertexColors.Add(FLinearColor::White);
        }
    }

    // Create triangles (two per quad)
    for (int32 y = 0; y < VertexCount; ++y)
    {
        for (int32 x = 0; x < VertexCount; ++x)
        {
            int32 i0 = y * (VertexCount + 1) + x;
            int32 i1 = i0 + 1;
            int32 i2 = i0 + (VertexCount + 1);
            int32 i3 = i2 + 1;

            // first triangle
            Triangles.Add(i0);
            Triangles.Add(i2);
            Triangles.Add(i1);
            // second triangle
            Triangles.Add(i1);
            Triangles.Add(i2);
            Triangles.Add(i3);
        }
    }

    ProcMesh->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UV0, VertexColors, Tangents, true);
    ProcMesh->SetMaterial(0, nullptr); // material can be set later in the editor
}

float AProceduralTerrainActor::GetHeight(float X, float Y) const
{
    // Simple Perlin noise based height (range -1..1)
    float ScaleFactor = 0.005f; // controls frequency
    return UKismetMathLibrary::PerlinNoise2D(FVector2D(X * ScaleFactor, Y * ScaleFactor));
}
