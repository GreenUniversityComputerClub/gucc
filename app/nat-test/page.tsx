'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Built-in dataset of eligible CRs for Fall 2025
const ELIGIBLE_CRS = `Student ID  ,Full Name ,Email Address  ,Contact Number
223002114,M.A. Rakib Sarker,marakibsarker2001@gmail.com,01580405140
252002076,Mst. Sabrina Shahriar ,sabrinashahriar2300@gmail.com,01304230089
252002086,SIBBIR AHMED MERAJ,sibbirahmmedmeraj0188@gmail.com,01321695723
252002129,Abdullah Al Abid ,abidabdullahal250@gmail.com,01927284038
252002023,MD ISMAIL HOSSAIN ,ismailhossainic@gmail.com,01323363398
252002018,MD. Asaduzzaman Roman ,33.roman.khan33@gmail.com,01407818235
252002131,Md Nayeem,nayeem120584@gmail.com,01799052887
252002121,Shahinur Al Shafi ,252002121@student.green.ac.bd,01797406810
252002017,Israt Jahan Shammi ,isratjahanshammi96@gmail.com,01602251657
251002029,Abdullah Md Galib,muhammad.cse.gub@gmail.com,01521706927
251002061,Mohammad Juniad Islam,mohammadjuniadislam24@gmail.com,01991929395
251002011,Jonayet Bogdady,jonayet251.cse.gub@gmail.com,01924877237
250002024,Mst. Mim Akter,azharamira400@gmail.com,01616841018
250002047,Mobashshia Jahan (Mahiya),mobashshia2047@gmail.com,01943934207
250002047,Mobashshia jahan (mahiya),mobashshia2047@gmail.com,01943934207
250002037,Md. Jikrul Islam Jeto,md.jikrulislamjeto@gmail.com,01312737611
250002138,Rifat Noor Alif ,rifatnooralif@gmail.com,01319420653
250002044,Md. Rahmat Ullah ,hanzalarahmatullah@gmail.com,01403495628
250002164,Nabedul Islam Nahed,nabedulislamnahed1@gmail.com,01632332403
250002134,Tanvir Seddike,sayseddike@gmail.com,01920248307
250002062,Nusrat Jahan ,nusratjahantanzila533@gmail.com,01618545788
250002128,Mohammad Saiyed Iqbal Umam ,iqbal.cse.gub@gmail.com,01317755673
250002153,Md. Alvy Rahman ,ralvi1211@gmail.com,01761088677
250002011,M. Muktadir Siam,siam64260@gmail.com,01751153004
250002094,Tahsin Khan Ramisa,khantahsin586@gmail.com,01936067920
250002011,M. Muktadir Siam ,siam64260@gmail.com,01751153004
250002020,Saif khan,saifkhanedu43@gmail.com,01732694942
242002167,Nusrat Jahan Sumaiya ,nusrat23200@gmail.com,01903276323
242002062,Nazmus Sakib,nazmussakib222834@gmail.com,01758955336
242002180,Sabbir Hossain Osmani,sabbirosmani04@gmail.com,01631183761
242002092,Tasnimul Hasan Himel,t.h.himel07@gmail.com,01701623316
242002087,Johirul Islam Niloy,mdnillahmedniloy@gmail.com,01967340608
241002099,Tasnim,sadiamoumita2004@gmail.com,01320995594
241002108,Maymuna Akter Sifa,rifat01715312@gmail.com,01719907203
241002098,Asaduzzaman Nur,asadhasan4873@gmail.com,01731645117
241002017,Md Farhad ,md1660782@gmail.com,01641569577
232002090,Ahadul Islam Alif,ahadulislamalif6@gmail.com,01760984973
232002241,Sonjoy Kumar Shil,sonjoyshill1447ssc@gmail.com,01718375143
232002228,Md Tajim Akand,tajimislam605@gmail.com,01717919491
232002007,Shah Jalal,shahjalal0212@gmail.com,01868520369
232002007,Shah Jalal,shahjalal0212@gmail.com,01868520369
232002068,Md.Ekra Islam Ohi,ekraislamohi2023@gmail.com,01581828741
232002008,Md Mamun Shahriar ,mamunshahriar2002@gmail.com,01569106340
232002192,Ajmain Inkiad Ayon ,ajmaininkiad016@gmail.com,01792187513
232002279,Md Tanvir Hasan Abokash,tanvirhasan.csc@gmail.com,01821713904
232002112,MD. DELWAR HOSSAIN ,delwarhossaintwd@gmail.com,01997248891
232002216,Md Nazimul Islam,nazimulll250@gmail.com,01817381037
231002032,Md Omor Faruk,mdomorfaruk2gazi@gmail.com,01604419446
223902073,Nazmus Sakib,nazmussakib.nms@gmail.com,01638637167
223002083,Abdullah Sardar ,abdullahalarafat147@gmail.com,01518992755
223002068,Refat Rahman,professionalrefatrahman@gmail.com,01890578753
223002083,Abdullah Sardar,abdullahalarafat147@gmail.com,01518992755
223002120,Taher Mahmud Monmoy,monmoyzx@gmail.com,01868983398
223002071,MD.MURSHALIN MUCKDHO,223002071@student.green.ac.bd,01521581093
223015072,Mofasser Hossain,mofasserhossain01@gmail.com,01875752483
223002038,Md. Reahoon Zannah,rihoon.223002038@gmail.com,01771189608
223015016,Sagar Kumar ,sagark016505@gmail.com,01757569505
222002066,Ashrafun Nahar Arifa ,ashrafunnahararifa@gmail.com,01780213066
222002068,Md. Robiul Islam ,md.robiulislam.qcsc@gmail.com,01770120136
222902019,Mehreen Jerin Khan ,222902019@student.green.edu.bd,01920238583
222902055,Bijoy Chandro Das ,amibijoy99@gmail.com,01624993961
222002038,Mst. Israt Jahan Emu,pentester.emu@gmail.com,01776632370
222002082,Pronoy Sarker Amit,pronoysarkeramit@gmail.com,01992717518
222002007,Afifah Joarder ,222002007@student.green.edu.bd,01601277660
222902026,Md Sakib Hasan Emon ,222902026@student.green.edu.bd,01614633411
221902245,Samim Reza,221902245@student.green.edu.bd,01747773315
221902279,Md. Mustakim Hossain ,mustakim.cse.gub@gmail.com,01955966123
221002575,Antu Marma,221002575@student.green.edu.bd,01840115980
221002080,Md Wasif Wahab ,wasifwww6@gmail.com,01629501903
221002052,Md.Mainul Islam Nerob,mdmainulislamnerob52@gmail.com,01716497155
221002611,Md. Rakibul Hasan ,221002611@student.green.edu.bd,01798107004
221002474,S. N. Fariha Zannat,sn.fariha.zannat@gmail.com,01957433111
221002078,Fuad Ahammed ,221002078@student.green.edu.bd,01793073134
221902064,Sajal Bhuiyan ,221902064@student.green.edu.bd,01701562521
221002011,Abdullah Al Mamun ,221002011@student.green.edu.bd,01849634858
221002519,Md Kawsar Hamid ,mdkawsarnk78@gmail.com,01601532640
221002393,Syed Raiyan Nasim ,raiyannasim91200@gmail.com,01537204470
221902324,MD. MOSHIUR RAHMAN,221902324@student.green.edu.bd,01400992723
221002037,Ridwanur Rahman Rifat ,221002037@student.green.edu.bd,01552931265
221002154,Md. Monirul Islam,221002154@student.green.edu.bd,01742958888
221002388,Hazrat Ali,hmhazratali12@gmail.com,01883860803
221002565,Md. Akramul Hoque ,m.a.h.reja1@gmail.com,01703042510
221902218,Raihan Kabir ,raihank0192@gmail.com,01795867501
221002213,K M Monoarul Islam Shovon ,shovon2565@gmail.com,01744236932
221002573,S M Naymuzzaman Nahid ,naymuzzamannahid65@gmail.com,01552650389
221902148,Fatema Amir Ami,fatemaamirami9329@gmail.com,01610719006
221002567,Al Shahriar Ahommed Shanto,shahriarshanto221002567@gmail.com,01992648141
221902360,Md. Ratan Chowdhury ,ratanchowdhury169@gmail.com,01855745064
221002115,Pritam Saha Turja,pritamsahaturja1@gmail.com,01647185767
221002252,Md Adnan Khan ,saklinadnan555@gmail.com,01302433833
213902127,Md. Jubayerul Hasan Mahin,maahihasan2017@gmail.com,01615624167
241002099,Tasnim,sadiamoumita2004@gmail.com,01320995594
232002277,Mashuk Rahman,mashukrahman000@gmail.com,01942517753`;

interface StudentData {
  studentId: string;
  name: string;
  email: string;
  contactNumber: string;
  pickupPoint?: string;
  previousExperience?: string;
}

export default function NATTestPage() {
  const [uploadedData, setUploadedData] = useState<StudentData[]>([]);
  const [eligibleCRs, setEligibleCRs] = useState<StudentData[]>([]);
  const [randomSelection, setRandomSelection] = useState<StudentData[]>([]);
  const [selectionCount, setSelectionCount] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);

  // Parse the built-in CR dataset
  const parseEligibleCRs = (): Set<string> => {
    const lines = ELIGIBLE_CRS.trim().split('\n');
    const studentIds = new Set<string>();
    
    // Skip header and parse student IDs
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns[0]) {
        const studentId = columns[0].trim();
        studentIds.add(studentId);
      }
    }
    
    return studentIds;
  };

  // Parse CSV content
  const parseCSV = (content: string): StudentData[] => {
    const lines = content.trim().split('\n');
    const data: StudentData[] = [];
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Split by comma but handle quoted values
      const columns = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const cleanColumns = columns.map(col => col.replace(/^"|"$/g, '').trim());
      
      if (cleanColumns.length >= 4) {
        data.push({
          studentId: cleanColumns[0],
          name: cleanColumns[1],
          email: cleanColumns[2],
          contactNumber: cleanColumns[3],
          pickupPoint: cleanColumns[4] || '',
          previousExperience: cleanColumns[5] || '',
        });
      }
    }
    
    return data;
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      const text = await file.text();
      const parsedData = parseCSV(text);
      setUploadedData(parsedData);
      
      // Match with eligible CRs
      const eligibleIds = parseEligibleCRs();
      const matched = parsedData.filter(student => 
        eligibleIds.has(student.studentId)
      );
      
      // Remove duplicates based on student ID
      const uniqueMatched = Array.from(
        new Map(matched.map(item => [item.studentId, item])).values()
      );
      
      setEligibleCRs(uniqueMatched);
      setRandomSelection([]); // Reset random selection
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('Error parsing file. Please make sure it is a valid CSV file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Randomly select candidates
  const handleRandomSelection = () => {
    if (eligibleCRs.length === 0) {
      alert('No eligible CRs to select from!');
      return;
    }

    const count = Math.min(selectionCount, eligibleCRs.length);
    const shuffled = [...eligibleCRs].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    setRandomSelection(selected);
  };

  // Reset everything
  const handleReset = () => {
    setUploadedData([]);
    setEligibleCRs([]);
    setRandomSelection([]);
    setSelectionCount(5);
  };

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">NAT Test Assistant Invigilator Selection</h1>
        <p className="text-muted-foreground mb-8">
          Upload applicant data to match with eligible CRs and randomly select assistant invigilators
        </p>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Applicant Data</CardTitle>
            <CardDescription>
              Upload a CSV file containing Student ID, Name, Email, Contact Number, Pickup Point, and Previous Experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    <span>Choose File</span>
                  </div>
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {uploadedData.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {uploadedData.length} records uploaded
                  </span>
                )}
              </div>
              {uploadedData.length > 0 && (
                <Button onClick={handleReset} variant="outline">
                  Reset All Data
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Uploaded Data Table */}
        {uploadedData.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Uploaded Data ({uploadedData.length} records)</CardTitle>
              <CardDescription>All applicants from the uploaded file</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Contact Number</TableHead>
                      <TableHead>Pickup Point</TableHead>
                      <TableHead>Previous Experience</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadedData.map((student, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{student.studentId}</TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.contactNumber}</TableCell>
                        <TableCell>{student.pickupPoint}</TableCell>
                        <TableCell>{student.previousExperience}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Eligible CRs Table */}
        {eligibleCRs.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Eligible CRs ({eligibleCRs.length} matched)</CardTitle>
              <CardDescription>
                Applicants who are confirmed CRs for the current semester
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Contact Number</TableHead>
                      <TableHead>Pickup Point</TableHead>
                      <TableHead>Previous Experience</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligibleCRs.map((student, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{student.studentId}</TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.contactNumber}</TableCell>
                        <TableCell>{student.pickupPoint}</TableCell>
                        <TableCell>{student.previousExperience}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Random Selection Section */}
        {eligibleCRs.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Random Selection</CardTitle>
              <CardDescription>
                Select a random number of candidates from eligible CRs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <Label htmlFor="selection-count">Number of candidates to select:</Label>
                <Input
                  id="selection-count"
                  type="number"
                  min="1"
                  max={eligibleCRs.length}
                  value={selectionCount}
                  onChange={(e) => setSelectionCount(parseInt(e.target.value) || 1)}
                  className="w-32"
                />
                <Button onClick={handleRandomSelection}>
                  Generate Random Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Random Selection Results */}
        {randomSelection.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Selected Assistant Invigilators ({randomSelection.length})</CardTitle>
              <CardDescription>
                Randomly selected candidates for NAT Test
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Contact Number</TableHead>
                      <TableHead>Pickup Point</TableHead>
                      <TableHead>Previous Experience</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {randomSelection.map((student, index) => (
                      <TableRow key={index} className="bg-green-50 dark:bg-green-900/20">
                        <TableCell className="font-medium">{student.studentId}</TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.email}</TableCell>
                        <TableCell>{student.contactNumber}</TableCell>
                        <TableCell>{student.pickupPoint}</TableCell>
                        <TableCell>{student.previousExperience}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {uploadedData.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">No data uploaded yet</p>
                <p className="text-sm">Upload a CSV file to get started</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
