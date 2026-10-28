// DemoWorld/Source/DemoWorld/DemoWorld.Build.cs
using UnrealBuildTool;

public class DemoWorld : ModuleRules
{
    public DemoWorld(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "ProceduralMeshComponent" });
        PrivateDependencyModuleNames.AddRange(new string[] { });
    }
}
