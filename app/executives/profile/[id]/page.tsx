import { getExecutivesByYear } from "../../util";
import Certificate from "./certificate";

const executives = getExecutivesByYear("2025");

export default function ProfilePage() {
  if (!executives) {
    return <div>No executives found for 2025</div>;
  }

  const allExecutives = [
    ...(executives.facultyMembers || []),
    ...(executives.studentExecutives || []),
  ];

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Executive Certificates</h1>
      <div className="flex flex-col gap-8">
        {allExecutives.map((executive, index) => (
          <div key={index} className="border rounded-lg p-4 shadow-md">
            <h2 className="text-xl font-semibold mb-2">{executive.name}</h2>
            <p className="text-gray-600 mb-4">{executive.position}</p>
            <Certificate
              name={executive.name}
              position={executive.position}
              profileLink={`${process.env.NEXT_PUBLIC_APP_URL}/profile/${123}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
