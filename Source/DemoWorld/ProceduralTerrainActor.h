// DemoWorld/Source/DemoWorld/ProceduralTerrainActor.h
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProceduralMeshComponent.h"
#include "ProceduralTerrainActor.generated.h"

UCLASS()
class DEMOWORLD_API AProceduralTerrainActor : public AActor
{
    GENERATED_BODY()
public:
    AProceduralTerrainActor();

protected:
    virtual void OnConstruction(const FTransform& Transform) override;

private:
    UPROPERTY(VisibleAnywhere)
    UProceduralMeshComponent* ProcMesh;

    void GenerateTerrain();
    float GetHeight(float X, float Y) const;
    int32 VertexCount = 128; // 128x128 grid
    float Scale = 100.f; // distance between vertices
    float HeightScale = 200.f;
};
