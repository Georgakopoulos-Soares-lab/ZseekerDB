package main

import "strconv"

const humanAssembly = "GCF_009914755.1"

func displayChromosome(chromosome, assembly string) string {
	if assembly != humanAssembly {
		return chromosome
	}
	for i := 0; i < 24; i++ {
		if chromosome == "NC_0"+strconv.Itoa(60925+i)+".1" {
			if i == 22 {
				return "X"
			}
			if i == 23 {
				return "Y"
			}
			return strconv.Itoa(i + 1)
		}
	}
	return chromosome
}

func accessionChromosome(chromosome, assembly string) string {
	if assembly != humanAssembly {
		return chromosome
	}
	for i := 0; i < 24; i++ {
		label := strconv.Itoa(i + 1)
		if i == 22 {
			label = "X"
		}
		if i == 23 {
			label = "Y"
		}
		if chromosome == label {
			return "NC_0" + strconv.Itoa(60925+i) + ".1"
		}
	}
	return chromosome
}
